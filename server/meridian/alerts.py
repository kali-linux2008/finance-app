"""Koersalerts en de volglijst.

Koersen komen alleen van bronnen die we al gebruiken: je eigen posities (Trading 212, OKX,
Trezor) en de openbare marktdata van OKX voor elke crypto. Er gaat niets extra's naar buiten.

Een belegging heet hier een "key":
- `okx:BTC` voor crypto (koers in euro via OKX, ook als je hem bezit);
- het positie-id (bijv. `t212-RHMd_EQ`) voor aandelen en ETF's die je hebt.
"""

import asyncio
import logging
import time
import uuid

import httpx

from . import config, digest, notify, portfolio, prices
from .store import Store

log = logging.getLogger("meridian.alerts")

CHECK_EVERY = 120  # seconden
REARM = 0.01  # "elke keer melden": pas opnieuw als de koers eerst 1% terug is geweest
MAX_ALERTS = 50
MAX_WATCH = 30
SPARK_TTL = 300

NAMES = {
    "BTC": "Bitcoin", "ETH": "Ethereum", "XRP": "XRP", "SOL": "Solana", "ADA": "Cardano", "DOGE": "Dogecoin",
    "DOT": "Polkadot", "LINK": "Chainlink", "AVAX": "Avalanche", "LTC": "Litecoin", "TRX": "Tron",
    "TON": "Toncoin", "SUI": "Sui", "XLM": "Stellar", "BNB": "BNB", "SHIB": "Shiba Inu", "PEPE": "Pepe",
    "UNI": "Uniswap", "ATOM": "Cosmos", "NEAR": "Near", "XAUT": "Tether Gold",
}


class AlertError(Exception):
    pass


def key_for(pos: dict) -> str:
    """De key van een positie uit je portefeuille."""
    return f"okx:{pos['tk']}" if pos.get("cat") == "cr" else pos["id"]


# Koersen

async def quotes(store: Store, client: httpx.AsyncClient, keys) -> dict[str, dict]:
    """Actuele koers per key. Keys zonder koers ontbreken in het resultaat."""
    keys = set(keys)
    out: dict[str, dict] = {}
    own = [k for k in keys if not k.startswith("okx:")]
    if own:
        try:
            positions = {p["id"]: p for p in (await portfolio.build(store, client))["positions"]}
        except Exception:  # noqa: BLE001 - dan alleen deze keer geen koers voor eigen aandelen
            log.warning("Portefeuille niet beschikbaar voor koersalerts", exc_info=True)
            positions = {}
        for k in own:
            p = positions.get(k)
            if p and p.get("price"):
                out[k] = {"key": k, "tk": p["tk"], "name": p["name"], "price": float(p["price"]),
                          "cur": p.get("cur") or "EUR", "chg": p.get("dayChange"), "cat": p.get("cat"), "own": True}

    async def crypto(k: str):
        ccy = k[4:]
        try:
            price, chg = await prices.eur_price(client, ccy)
        except prices.PriceError:
            return
        out[k] = {"key": k, "tk": ccy, "name": NAMES.get(ccy, ccy), "price": price, "cur": "EUR", "chg": chg, "cat": "cr"}

    await asyncio.gather(*(crypto(k) for k in keys if k.startswith("okx:")))
    return out


_spark: dict[str, tuple[float, list[float]]] = {}


async def spark(client: httpx.AsyncClient, key: str) -> list[float] | None:
    """Koersverloop van de laatste 24 uur (crypto). Voor aandelen hebben we geen historie."""
    if not key.startswith("okx:"):
        return None
    hit = _spark.get(key)
    if hit and time.time() - hit[0] < SPARK_TTL:
        return hit[1]
    try:
        pts = [c["c"] for c in await prices.ohlc(client, key[4:], "1H", 24)]
    except prices.PriceError:
        return None
    _spark[key] = (time.time(), pts)
    return pts


# Alerts

def get_alerts(store: Store) -> list[dict]:
    return store.get_setting("alerts") or []


def crossed(alert: dict, price: float) -> bool:
    return price >= alert["price"] if alert["dir"] == "boven" else price <= alert["price"]


def _back(alert: dict, price: float) -> bool:
    """Is de koers ver genoeg teruggekomen om een herhalende alert weer te laten afgaan?"""
    if alert["dir"] == "boven":
        return price < alert["price"] * (1 - REARM)
    return price > alert["price"] * (1 + REARM)


async def add_alert(store: Store, client: httpx.AsyncClient, data: dict) -> dict:
    key, direction = str(data.get("key", "")), data.get("dir")
    if direction not in ("boven", "onder"):
        raise AlertError("Kies stijgt boven of daalt onder.")
    try:
        target = round(float(data.get("price", 0)), 8)
    except (TypeError, ValueError):
        target = 0
    if target <= 0:
        raise AlertError("Kies een doelkoers boven nul.")
    if len(get_alerts(store)) >= MAX_ALERTS:
        raise AlertError(f"Je hebt al {MAX_ALERTS} alerts. Verwijder er eerst een.")
    q = (await quotes(store, client, [key])).get(key)
    if not q:
        raise AlertError("Geen koers gevonden voor deze belegging.")
    alert = {"id": uuid.uuid4().hex[:12], "key": key, "tk": q["tk"], "name": q["name"], "cur": q["cur"],
             "dir": direction, "price": target, "repeat": bool(data.get("repeat")), "created": time.time(), "armed": True}
    if crossed(alert, q["price"]):
        word = "boven" if direction == "boven" else "onder"
        raise AlertError(f"De koers staat nu al {word} {fmt(target, q['cur'])}. Kies een andere doelkoers.")
    store.set_setting("alerts", get_alerts(store) + [alert])
    return alert


def remove_alert(store: Store, alert_id: str) -> bool:
    old = get_alerts(store)
    new = [a for a in old if a["id"] != alert_id]
    store.set_setting("alerts", new)
    return len(new) != len(old)


async def check(store: Store, client: httpx.AsyncClient) -> list[dict]:
    """Kijkt alle alerts na en meldt de geraakte. Geeft de afgegane alerts terug."""
    alerts = get_alerts(store)
    if not alerts or not digest.enabled(store, "price"):  # koersalerts uitgezet: niets melden
        return []
    q = await quotes(store, client, {a["key"] for a in alerts})
    fired: list[tuple[dict, float]] = []
    changes: dict[str, dict | None] = {}  # id → nieuwe versie, of None = verwijderen
    for a in alerts:
        p = q.get(a["key"])
        if not p:
            continue
        price = p["price"]
        if a.get("armed", True) and crossed(a, price):
            fired.append((a, price))
            changes[a["id"]] = {**a, "armed": False, "hit": time.time()} if a["repeat"] else None
        elif not a.get("armed", True) and _back(a, price):
            changes[a["id"]] = {**a, "armed": True}
    if changes:
        # Opnieuw lezen: intussen kan de app een alert hebben toegevoegd of verwijderd.
        now = []
        for a in get_alerts(store):
            if a["id"] in changes:
                if changes[a["id"]] is not None:
                    now.append(changes[a["id"]])
            else:
                now.append(a)
        store.set_setting("alerts", now)
    for a, price in fired:
        word = "boven" if a["dir"] == "boven" else "onder"
        body = f"{a['name']} staat op {fmt(price, a['cur'])}, {word} je alert van {fmt(a['price'], a['cur'])}."
        if not a["repeat"]:
            body += " De alert staat nu uit."
        await notify.send(store, client, f"Koersalert · {a['tk']}", body, "info")
    return [a for a, _ in fired]


async def loop(store: Store, client: httpx.AsyncClient) -> None:
    while True:
        try:
            await check(store, client)
        except Exception:  # noqa: BLE001
            log.exception("Koersalerts: onverwachte fout")
        await asyncio.sleep(CHECK_EVERY)


# Volglijst

def get_watch(store: Store) -> list[dict]:
    return store.get_setting("watchlist") or []


async def add_watch(store: Store, client: httpx.AsyncClient, key: str) -> list[dict]:
    items = get_watch(store)
    if any(i["key"] == key for i in items):
        return items
    if len(items) >= MAX_WATCH:
        raise AlertError(f"Je volglijst is vol ({MAX_WATCH}). Verwijder er eerst een.")
    q = (await quotes(store, client, [key])).get(key)
    if not q:
        raise AlertError("Geen koers gevonden voor deze belegging.")
    items = items + [{"key": key, "tk": q["tk"], "name": q["name"], "cat": q.get("cat")}]
    store.set_setting("watchlist", items)
    return items


def remove_watch(store: Store, key: str) -> list[dict]:
    items = [i for i in get_watch(store) if i["key"] != key]
    store.set_setting("watchlist", items)
    return items


async def watch_state(store: Store, client: httpx.AsyncClient) -> dict:
    items = get_watch(store)
    q = await quotes(store, client, [i["key"] for i in items])
    sparks = await asyncio.gather(*(spark(client, i["key"]) for i in items))
    return {
        "items": [{**i, **q.get(i["key"], {"price": None, "cur": None, "chg": None}), "spark": s} for i, s in zip(items, sparks)],
        "alerts": get_alerts(store),
    }


# Zoeken (eigen bezit + crypto op OKX)

_coins: tuple[float, list[str]] = (0.0, [])


async def coins(client: httpx.AsyncClient) -> list[str]:
    """Alle crypto die je op OKX in euro of USDT kunt verhandelen (een dag bewaard)."""
    global _coins
    if _coins[1] and time.time() - _coins[0] < 86400:
        return _coins[1]
    try:
        r = await client.get(f"{config.OKX_URL}/api/v5/public/instruments", params={"instType": "SPOT"})
        rows = r.json().get("data") or []
    except (httpx.HTTPError, ValueError):
        return _coins[1]
    found = sorted({row["baseCcy"] for row in rows if row.get("quoteCcy") in ("EUR", "USDT") and row.get("state", "live") == "live"})
    if found:
        _coins = (time.time(), found)
    return found


async def search(store: Store, client: httpx.AsyncClient, query: str) -> list[dict]:
    q = query.strip().upper()
    if not q:
        return []
    out: list[dict] = []
    seen: set[str] = set()
    try:
        positions = (await portfolio.build(store, client))["positions"]
    except Exception:  # noqa: BLE001
        positions = []
    for p in positions:
        if not p.get("price") or p.get("cat") not in ("eq", "cr"):
            continue
        if q in p["tk"].upper() or q in p["name"].upper():
            k = key_for(p)
            if k not in seen:
                seen.add(k)
                out.append({"key": k, "tk": p["tk"], "name": p["name"], "cat": p["cat"], "own": True})
    named = {c for c, n in NAMES.items() if q in n.upper()}
    for c in await coins(client):
        if (c.startswith(q) or c in named) and f"okx:{c}" not in seen:
            seen.add(f"okx:{c}")
            out.append({"key": f"okx:{c}", "tk": c, "name": NAMES.get(c, c), "cat": "cr", "own": False})
    # Eigen bezit eerst, daarna exacte ticker, daarna kortste ticker.
    out.sort(key=lambda r: (not r["own"], r["tk"] != q, len(r["tk"]), r["tk"]))
    return out[:20]


def fmt(x: float, cur: str = "EUR") -> str:
    """€ 1.234,56 of $ 0,5123 (kleine koersen met meer cijfers)."""
    decimals = 2 if x >= 10 else 4 if x >= 0.01 else 8
    s = f"{x:,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{'$' if cur == 'USD' else '€'} {s}"
