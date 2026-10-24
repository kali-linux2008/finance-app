"""Alle bronnen ophalen, samenvoegen tot één portefeuille en het verloop bijhouden."""

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime

import httpx

from . import config
from .models import Position, SourceResult, Wallet
from .sources import manual, okx, trading212, trezor
from .store import Store

FETCHERS = {"t212": trading212.fetch, "okx": okx.fetch, "trezor": trezor.fetch}
TTL = {"t212": 60, "okx": 60, "trezor": 300}
ORDER = ["t212", "bank", "trezor", "okx", "manual"]
NAMES = {"t212": "Trading 212", "okx": "OKX", "trezor": "Trezor"}


@dataclass
class Cached:
    result: SourceResult | None = None
    at: float = 0
    error: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_cache: dict[str, Cached] = {}


def _to_json(res: SourceResult) -> dict:
    return {"id": res.id, "name": res.name, "change": res.change, "sub": res.sub,
            "positions": [p.to_json() for p in res.positions]}


def _from_json(d: dict) -> SourceResult:
    positions = []
    for p in d.get("positions", []):
        wallets = [Wallet(**w) for w in p.pop("wallets", None) or []] or None
        positions.append(Position(**p, wallets=wallets))
    return SourceResult(id=d["id"], name=d["name"], positions=positions, change=d.get("change"), sub=d.get("sub"))


async def _source(client: httpx.AsyncClient, store: Store, sid: str, force: bool) -> Cached:
    c = _cache.setdefault(sid, Cached())
    async with c.lock:
        if not force and c.result and time.time() - c.at < TTL[sid]:
            return c
        try:
            c.result = await FETCHERS[sid](client, store.get_secret(sid) or {})
            c.at, c.error = time.time(), None
            # Laatst bekende stand bewaren, zodat een storing na een herstart niet als € 0 telt.
            store.set_setting(f"last.{sid}", {"at": c.at, "result": _to_json(c.result)})
        except Exception as e:  # één kapotte bron mag de rest niet tegenhouden
            c.error = str(e).strip() or f"Geen verbinding ({e.__class__.__name__})"
            if c.result is None and (last := store.get_setting(f"last.{sid}")):
                c.result, c.at = _from_json(last["result"]), last["at"]
        return c


def merge_crypto(positions: list[Position]) -> list[Position]:
    """Dezelfde munt op meerdere plekken (bijv. BTC op Trezor én OKX) wordt één positie met bewaarplekken."""
    out: list[Position] = []
    by_tk: dict[str, list[Position]] = {}
    for p in positions:
        if p.cat == "cr":
            by_tk.setdefault(p.tk, []).append(p)
        else:
            out.append(p)
    for tk, group in by_tk.items():
        if len(group) == 1:
            out.append(group[0])
            continue
        group.sort(key=lambda p: -p.value)
        first = group[0]
        qty = sum(p.qty or 0 for p in group)
        out.append(Position(
            id=tk.lower(), tk=tk, name=first.name, cls="Crypto", cat="cr", src=" · ".join(p.src for p in group),
            value=round(sum(p.value for p in group), 2), tile=2, qty=round(qty, 8), unit=first.unit,
            price=first.price, cur=first.cur, dayChange=first.dayChange,
            wallets=[Wallet(
                name=p.src, qty=f"{p.qty:.4f} {p.unit}".replace(".", ","), value=p.value,
                icon="lock" if p.id.startswith("trezor") else "currency_exchange",
                note="Cold storage · alleen-lezen" if p.id.startswith("trezor") else "Exchange · via API",
            ) for p in group],
        ))
    return out


def start_of_day(now: float) -> float:
    d = datetime.fromtimestamp(now, config.TZ)
    return d.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


async def build(store: Store, client: httpx.AsyncClient, force: bool = False) -> dict:
    data = manual.normalize(store.get_setting("manual"))
    configured = [s for s in store.sources() if s in FETCHERS]
    cached = await asyncio.gather(*(_source(client, store, s, force) for s in configured))

    results: list[tuple[SourceResult | None, Cached | None, str]] = [(c.result, c, s) for c, s in zip(cached, configured)]
    bank = manual.bank_source(data)
    if bank:
        results.append((bank, None, "bank"))
    gold = await manual.gold_source(client, data)
    if gold:
        results.append((gold, None, "manual"))
    results.sort(key=lambda r: ORDER.index(r[2]) if r[2] in ORDER else 99)

    positions: list[Position] = []
    sources, warnings = [], []
    for res, c, sid in results:
        if res:
            positions += res.positions
            warnings += res.warnings
        status = "ok" if not c or not c.error else ("oud" if res else "fout")
        sources.append({
            "id": sid, "name": res.name if res else NAMES.get(sid, sid), "value": round(res.value, 2) if res else 0,
            "change": res.change if res else None, "sub": res.sub if res else None,
            "status": status, "error": c.error if c else None,
            "syncedAt": c.at if c and c.at else time.time(),
        })

    positions = sorted(merge_crypto(positions), key=lambda p: -p.value)
    total = round(sum(p.value for p in positions), 2)
    with_cost = [p for p in positions if p.cost is not None]
    now = time.time()

    complete = all(s["status"] == "ok" for s in sources)
    if complete and positions:
        store.add_snapshot(total, now)
        store.prune_snapshots(now)
    before = store.snapshot_before(start_of_day(now))

    return {
        "asOf": now,
        "total": total,
        "dayChange": round(total - before[1], 2) if before else None,
        "invested": round(sum(p.value for p in with_cost), 2),
        "cost": round(sum(p.cost or 0 for p in with_cost), 2),
        "positions": [p.to_json() for p in positions],
        "sources": sources,
        "outside": manual.outside(data),
        "warnings": warnings,
    }


PERIOD_SECONDS = {"1D": 86400, "1W": 7 * 86400, "1M": 31 * 86400, "1J": 366 * 86400, "Alles": None}


def history(store: Store, period: str, now: float | None = None) -> list[tuple[float, float]]:
    now = now or time.time()
    span = PERIOD_SECONDS[period]
    return store.snapshots(now - span if span else 0)
