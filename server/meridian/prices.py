"""Koersen in euro via de openbare marktdata van OKX (geen sleutel nodig)."""

import time

import httpx

from . import config

# instId → (tijdstip, laatste koers, koers bij start van de dag in UTC)
_cache: dict[str, tuple[float, float, float]] = {}
TTL = 60

TROY_OUNCE_G = 31.1034768


class PriceError(Exception):
    pass


async def ticker(client: httpx.AsyncClient, inst: str) -> tuple[float, float] | None:
    hit = _cache.get(inst)
    if hit and time.time() - hit[0] < TTL:
        return hit[1], hit[2]
    try:
        r = await client.get(f"{config.OKX_URL}/api/v5/market/ticker", params={"instId": inst})
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise PriceError("Koersdienst (OKX) is niet bereikbaar") from e
    if r.status_code != 200 or body.get("code") != "0" or not body.get("data"):
        return None
    d = body["data"][0]
    last, sod = float(d["last"]), float(d.get("sodUtc0") or d["last"])
    _cache[inst] = (time.time(), last, sod)
    return last, sod


async def eur_price(client: httpx.AsyncClient, ccy: str) -> tuple[float, float]:
    """(koers in euro, % verandering vandaag). Probeert X-EUR, anders X-USDT omgerekend."""
    if ccy == "EUR":
        return 1.0, 0.0
    direct = await ticker(client, f"{ccy}-EUR")
    if direct:
        return direct[0], _pct(*direct)
    usdt_eur = await _usdt_eur(client)
    if ccy in ("USDT", "USDC"):
        return usdt_eur, 0.0
    via = await ticker(client, f"{ccy}-USDT")
    if via:
        return via[0] * usdt_eur, _pct(*via)
    raise PriceError(f"Geen koers gevonden voor {ccy}")


async def _usdt_eur(client: httpx.AsyncClient) -> float:
    t = await ticker(client, "USDT-EUR")
    if t:
        return t[0]
    t = await ticker(client, "EUR-USDT")
    if t:
        return 1 / t[0]
    raise PriceError("Geen wisselkoers USDT/EUR")


async def gold_per_gram_eur(client: httpx.AsyncClient) -> float:
    """Goudprijs per gram via XAUT (1 token = 1 troy ounce goud)."""
    price, _ = await eur_price(client, "XAUT")
    return price / TROY_OUNCE_G


def _pct(last: float, sod: float) -> float:
    return (last - sod) / sod * 100 if sod else 0.0


# Periode in de app → candle-grootte en aantal bij OKX
CANDLES = {"1D": ("5m", 288), "1W": ("1H", 168), "1M": ("4H", 180), "1J": ("1D", 300), "Alles": ("1W", 300)}


async def candles(client: httpx.AsyncClient, ccy: str, period: str) -> list[tuple[float, float]]:
    """Slotkoersen in euro, oud → nieuw: [(tijd in s, koers)]."""
    bar, limit = CANDLES[period]
    inst, factor = f"{ccy}-EUR", 1.0
    if not await ticker(client, inst):
        inst, factor = f"{ccy}-USDT", await _usdt_eur(client)
    points: list[tuple[float, float]] = []
    after = ""
    while len(points) < limit:
        params = {"instId": inst, "bar": bar, "limit": "100"}
        if after:
            params["after"] = after
        try:
            r = await client.get(f"{config.OKX_URL}/api/v5/market/history-candles", params=params)
            rows = r.json().get("data") or []
        except (httpx.HTTPError, ValueError) as e:
            raise PriceError("Koersdienst (OKX) is niet bereikbaar") from e
        if not rows:
            break
        points += [(int(row[0]) / 1000, float(row[4]) * factor) for row in rows]
        after = rows[-1][0]
    return sorted(points[:limit])


async def ohlc(client: httpx.AsyncClient, ccy: str, bar: str = "15m", limit: int = 40) -> list[dict]:
    """Candles met volume voor het handelsscherm, oud → nieuw, koersen in euro."""
    inst, factor = f"{ccy}-EUR", 1.0
    if not await ticker(client, inst):
        inst, factor = f"{ccy}-USDT", await _usdt_eur(client)
    try:
        r = await client.get(f"{config.OKX_URL}/api/v5/market/candles", params={"instId": inst, "bar": bar, "limit": str(limit)})
        rows = r.json().get("data") or []
    except (httpx.HTTPError, ValueError) as e:
        raise PriceError("Koersdienst (OKX) is niet bereikbaar") from e
    return [{"t": int(row[0]) / 1000, "o": float(row[1]) * factor, "h": float(row[2]) * factor,
             "l": float(row[3]) * factor, "c": float(row[4]) * factor, "v": float(row[5])} for row in reversed(rows)]
