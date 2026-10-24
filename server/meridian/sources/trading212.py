"""Trading 212 (Invest/ISA): posities en cash via de openbare API (bèta).

Sleutels maak je in de app: Instellingen → API. Geef alleen leesrechten
(account, portefeuille, metadata). Demo en echt geld hebben elk eigen sleutels.
"""

import base64
import re
import time

import httpx

from ..models import Position, SourceResult

LIVE = "https://live.trading212.com/api/v0"
DEMO = "https://demo.trading212.com/api/v0"

# Instrumentgegevens (ETF of aandeel, korte naam) veranderen zelden en de limiet is 1× per 50 s.
_meta: dict[str, tuple[float, dict[str, dict]]] = {}
META_TTL = 24 * 3600


class T212Error(Exception):
    pass


class T212NotFound(T212Error):
    pass


def auth_header(key: str, secret: str | None) -> dict[str, str]:
    if secret:
        token = base64.b64encode(f"{key}:{secret}".encode()).decode()
        return {"Authorization": f"Basic {token}"}
    return {"Authorization": key}  # oude sleutels zonder geheim


def short_ticker(t212_ticker: str) -> str:
    """'AAPL_US_EQ' → 'AAPL', 'VWCEd_EQ' → 'VWCE'."""
    base = t212_ticker.split("_")[0]
    return re.sub(r"[a-z]+$", "", base) or base


async def request(client: httpx.AsyncClient, base: str, method: str, path: str, headers: dict,
                  body: dict | None = None) -> object:
    r = await client.request(method, base + path, headers=headers, json=body)
    if r.status_code == 401:
        raise T212Error("Trading 212 weigert de sleutel (401). Klopt de sleutel en het geheim?")
    if r.status_code == 403:
        need = "leesrechten" if method == "GET" else "het recht Orders"
        raise T212Error(f"De sleutel mist {need} voor dit onderdeel (403).")
    if r.status_code == 404:
        raise T212NotFound(f"Onbekend onderdeel bij Trading 212: {path}")
    if r.status_code == 429:
        raise T212Error("Te veel verzoeken aan Trading 212 (429). Even geduld.")
    if r.status_code >= 400:
        raise T212Error(f"Trading 212 gaf fout {r.status_code}{_reason(r)}")
    return r.json() if r.content else None


def _reason(r: httpx.Response) -> str:
    """Trading 212 legt een geweigerde order uit in de body, bijv. {"code": "InsufficientFreeForStocksBuy"}."""
    try:
        body = r.json()
    except ValueError:
        return ""
    if isinstance(body, dict):
        text = body.get("clarification") or body.get("message") or body.get("code") or body.get("type")
        return f": {text}" if text else ""
    return ""


async def _get(client: httpx.AsyncClient, base: str, path: str, headers: dict) -> object:
    return await request(client, base, "GET", path, headers)


async def _instruments(client: httpx.AsyncClient, base: str, headers: dict) -> dict[str, dict]:
    hit = _meta.get(base)
    if hit and time.time() - hit[0] < META_TTL:
        return hit[1]
    try:
        rows = await _get(client, base, "/equity/metadata/instruments", headers)
    except T212Error:
        return hit[1] if hit else {}
    data = {row["ticker"]: row for row in rows if isinstance(row, dict) and "ticker" in row}
    _meta[base] = (time.time(), data)
    return data


async def fetch(client: httpx.AsyncClient, secret: dict) -> SourceResult:
    base = DEMO if secret.get("demo") else LIVE
    headers = auth_header(secret["key"], secret.get("secret"))
    res = SourceResult(id="t212", name="Trading 212" + (" (demo)" if secret.get("demo") else ""))
    meta = await _instruments(client, base, headers)

    try:
        rows = await _get(client, base, "/equity/positions", headers)
        positions = [_from_position(row, meta) for row in rows]
    except T212NotFound:
        rows = await _get(client, base, "/equity/portfolio", headers)  # oudere API
        positions = [_from_portfolio(row, meta) for row in rows]
    res.positions = [p for p in positions if p.value > 0]

    cash = await _cash(client, base, headers, res)
    if cash > 0:
        res.positions.append(Position(
            id="t212-cash", tk="T212", name="Vrij saldo Trading 212", cls="Cash", cat="cash",
            src=res.name, value=round(cash, 2), tile=4,
        ))
    return res


async def _cash(client: httpx.AsyncClient, base: str, headers: dict, res: SourceResult) -> float:
    try:
        s = await _get(client, base, "/equity/account/summary", headers)
        if s.get("currency") and s["currency"] != "EUR":
            res.warnings.append(f"Je Trading 212-account is in {s['currency']}; bedragen zijn niet omgerekend.")
        cash = s.get("cash") or {}
        return float(cash.get("availableToTrade") or 0) + float(cash.get("inPies") or 0)
    except T212NotFound:
        c = await _get(client, base, "/equity/account/cash", headers)
        return float(c.get("free") or 0) + float(c.get("pieCash") or 0)


def _cls(meta: dict | None) -> str:
    return "ETF" if meta and str(meta.get("type", "")).upper() == "ETF" else "Aandeel"


def _from_position(row: dict, meta: dict[str, dict]) -> Position:
    inst = row.get("instrument") or {}
    ticker = inst.get("ticker", "")
    m = meta.get(ticker)
    wallet = row.get("walletImpact") or {}
    qty = float(row.get("quantity") or 0)
    return Position(
        id=f"t212-{ticker}", tk=(m or {}).get("shortName") or short_ticker(ticker),
        name=inst.get("name") or (m or {}).get("name") or ticker, cls=_cls(m), cat="eq",
        src="Trading 212", value=round(float(wallet.get("currentValue") or 0), 2), tile=1,
        qty=qty, unit="st", price=float(row.get("currentPrice") or 0),
        cur=inst.get("currency") or (m or {}).get("currencyCode"),
        cost=round(float(wallet["totalCost"]), 2) if wallet.get("totalCost") is not None else None,
    )


def _from_portfolio(row: dict, meta: dict[str, dict]) -> Position:
    """Oude /equity/portfolio: koersen in de valuta van het instrument, ppl in accountvaluta (EUR).

    Alleen voor instrumenten in euro is de waarde exact; anders schatten we hem met de koers
    en laten we de aankoopwaarde leeg, omdat de wisselkoers van toen onbekend is.
    """
    ticker = row.get("ticker", "")
    m = meta.get(ticker) or {}
    qty = float(row.get("quantity") or 0)
    avg, price, ppl = float(row.get("averagePrice") or 0), float(row.get("currentPrice") or 0), float(row.get("ppl") or 0)
    cur = m.get("currencyCode")
    in_eur = cur in (None, "EUR")
    cost = qty * avg if in_eur else None
    return Position(
        id=f"t212-{ticker}", tk=m.get("shortName") or short_ticker(ticker),
        name=m.get("name") or ticker, cls=_cls(m), cat="eq", src="Trading 212",
        value=round((cost + ppl) if cost is not None else qty * price, 2), tile=1, qty=qty, unit="st",
        price=price, cur=cur, cost=round(cost, 2) if cost is not None else None,
    )
