"""OKX: saldi van je handels- en fundingaccount.

Maak bij OKX een API-sleutel met alleen het recht "Lezen" (handelen pas in stap 5,
opnemen nooit). Bij demo-sleutels zet de server de demo-modus aan.
"""

import base64
import hashlib
import hmac
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx

from .. import config, prices
from ..models import Position, SourceResult

NAMES = {"BTC": "Bitcoin", "ETH": "Ethereum", "SOL": "Solana", "USDT": "Tether", "USDC": "USD Coin", "EUR": "Euro"}
MIN_VALUE = 1.0  # stof onder € 1 laten we weg


class OkxError(Exception):
    pass


def sign(secret: str, ts: str, method: str, path: str, body: str = "") -> str:
    mac = hmac.new(secret.encode(), (ts + method.upper() + path + body).encode(), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


async def _get(client: httpx.AsyncClient, secret: dict, path: str, params: dict | None = None) -> list:
    if params:
        path += "?" + urlencode(params)
    ts = _timestamp()
    headers = {
        "OK-ACCESS-KEY": secret["key"],
        "OK-ACCESS-SIGN": sign(secret["secret"], ts, "GET", path),
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": secret["passphrase"],
        "Content-Type": "application/json",
    }
    if secret.get("demo"):
        headers["x-simulated-trading"] = "1"
    r = await client.get(config.OKX_URL + path, headers=headers)
    body = r.json()
    if body.get("code") != "0":
        raise OkxError(f"OKX: {body.get('msg') or 'onbekende fout'} (code {body.get('code')})")
    return body.get("data") or []


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
