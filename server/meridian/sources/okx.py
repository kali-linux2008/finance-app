"""OKX: saldi van je handels- en fundingaccount.

Maak bij OKX een API-sleutel met alleen het recht "Lezen" (handelen pas in stap 5,
opnemen nooit). Bij demo-sleutels zet de server de demo-modus aan.
"""

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from .. import config, prices
from ..models import Position, SourceResult

# OKX heeft per regio een eigen omgeving; een sleutel werkt alleen in de omgeving waar hij gemaakt is.
# Nederland/EU = OKX Europe (eea.okx.com). Zie https://www.okx.com/en-eu/help/api-faq-eea
DOMAINS = ["https://eea.okx.com", "https://www.okx.com", "https://my.okx.com"]
WRONG_REGION = "50119"

NAMES = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana", "USDT": "Tether", "USDC": "USD Coin", "EUR": "Euro"}
MIN_VALUE = 1.0  # stof onder € 1 laten we weg


class OkxError(Exception):
    def __init__(self, message: str, code: str | None = None):
        super().__init__(message)
        self.code = code


def sign(secret: str, ts: str, method: str, path: str, body: str = "") -> str:
    mac = hmac.new(secret.encode(), (ts + method.upper() + path + body).encode(), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def request(client: httpx.AsyncClient, secret: dict, method: str, path: str,
                  params: dict | None = None, body: dict | None = None) -> list:
    """Ondertekend verzoek aan OKX. Bij demo-sleutels gaat de header voor demo-handel mee."""
    if params:
        path += "?" + urlencode(params)
    payload = json.dumps(body) if body is not None else ""
    ts = _timestamp()
    headers = {
        "OK-ACCESS-KEY": secret["key"],
        "OK-ACCESS-SIGN": sign(secret["secret"], ts, method, path, payload),
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": secret["passphrase"],
        "Content-Type": "application/json",
    }
    if secret.get("demo"):
        headers["x-simulated-trading"] = "1"
    r = await client.request(method, secret.get("domain", config.OKX_URL) + path, headers=headers, content=payload or None)
    data = r.json()
    if data.get("code") != "0":
        code = str(data.get("code"))
        # Bij orders staat de echte reden per regel in data[].sMsg.
        rows = data.get("data") or []
        detail = next((d.get("sMsg") for d in rows if isinstance(d, dict) and d.get("sMsg")), None)
        hint = " Je sleutel hoort bij een andere OKX-regio; voeg de bron opnieuw toe." if code == WRONG_REGION else ""
        raise OkxError(f"OKX: {detail or data.get('msg') or 'onbekende fout'} (code {code}).{hint}", code)
    return data.get("data") or []


async def _get(client: httpx.AsyncClient, secret: dict, path: str, params: dict | None = None) -> list:
    return await request(client, secret, "GET", path, params)


async def find_domain(client: httpx.AsyncClient, secret: dict) -> str:
    """Probeert de OKX-regio's tot de sleutel herkend wordt; geeft het werkende adres terug."""
    last: OkxError | None = None
    for domain in DOMAINS:
        try:
            await _get(client, {**secret, "domain": domain}, "/api/v5/account/balance")
            return domain
        except OkxError as e:
            if e.code != WRONG_REGION:
                raise  # sleutel bestaat hier wel, maar er is iets anders mis (bijv. passphrase)
            last = e
    raise OkxError("OKX kent deze API-sleutel in geen enkele regio (code 50119). Klopt de sleutel? "
                   "Maakte je hem in de demo-omgeving, voeg dan --demo toe.", WRONG_REGION) from last


async def balances(client: httpx.AsyncClient, secret: dict) -> dict[str, float]:
    """Hoeveelheid per munt, handelsaccount en fundingaccount bij elkaar opgeteld."""
    total: dict[str, float] = {}
    trading = await _get(client, secret, "/api/v5/account/balance")
    for acc in trading:
        for d in acc.get("details") or []:
            total[d["ccy"]] = total.get(d["ccy"], 0) + float(d.get("eq") or d.get("cashBal") or 0)
    for d in await _get(client, secret, "/api/v5/asset/balances"):
        total[d["ccy"]] = total.get(d["ccy"], 0) + float(d.get("bal") or 0)
    return {k: v for k, v in total.items() if v > 0}


async def fetch(client: httpx.AsyncClient, secret: dict) -> SourceResult:
    name = "OKX" + (" (demo)" if secret.get("demo") else "")
    res = SourceResult(id="okx", name=name)
    value_before = 0.0
    for ccy, qty in (await balances(client, secret)).items():
        try:
            price, day = await prices.eur_price(client, ccy)
        except prices.PriceError as e:
            res.warnings.append(str(e))
            continue
        value = qty * price
        if value < MIN_VALUE:
            continue
        value_before += value / (1 + day / 100)
        cash = ccy in ("EUR",)
        res.positions.append(Position(
            id=f"okx-{ccy}", tk=ccy, name=NAMES.get(ccy, ccy), cls="Cash" if cash else "Crypto",
            cat="cash" if cash else "cr", src=name, value=round(value, 2), tile=4 if cash else 2,
            qty=qty, unit=ccy, price=price, cur="EUR", dayChange=None if cash else round(day, 2),
        ))
    if value_before:
        res.change = round((res.value / value_before - 1) * 100, 2)
    return res
