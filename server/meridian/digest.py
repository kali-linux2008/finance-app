"""Vaste meldingen: weekoverzicht, mijlpalen naar je FIRE-doel en ontvangen dividend.

Elke soort kun je aan- of uitzetten (app of `python -m meridian melding soorten`). Koersalerts
staan in alerts.py, de inleg-meldingen in plans.py.
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta

import httpx

from . import config, notify, portfolio
from .sources import trading212
from .store import Store

log = logging.getLogger("meridian.digest")

TYPES_KEY = "notify.types"
TYPES = {"price": "Koersalerts", "div": "Dividend ontvangen", "goal": "Doel-mijlpalen", "week": "Weekoverzicht",
         "order": "Orders uitgevoerd"}
GOAL_KEY = "goal.fire"
DEFAULT_GOAL = 500_000.0
WEEK_DAY, WEEK_HOUR = 6, 18  # zondag 18:00, zoals in het ontwerp
DIVIDEND_EVERY = 6 * 3600
CHECK_EVERY = 600
KEEP_SEEN = 300


def types(store: Store) -> dict[str, bool]:
    return {k: True for k in TYPES} | (store.get_setting(TYPES_KEY) or {})


def enabled(store: Store, kind: str) -> bool:
    return types(store).get(kind, True)


def set_types(store: Store, changes: dict) -> dict[str, bool]:
    cur = types(store)
    cur.update({k: bool(v) for k, v in changes.items() if k in TYPES})
    store.set_setting(TYPES_KEY, cur)
    return cur


def goal(store: Store) -> float:
    return float(store.get_setting(GOAL_KEY, DEFAULT_GOAL))


def _eur(v: float, signed: bool = False) -> str:
    s = f"{abs(v):,.0f}".replace(",", ".")
    sign = ("+" if v >= 0 else "−") if signed else ("−" if v < 0 else "")
    return f"{sign}€ {s}"


def _pct(v: float) -> str:
    return f"{'+' if v >= 0 else '−'}{abs(v):.1f}%".replace(".", ",")


def _latest(store: Store, now: datetime) -> tuple[float, float] | None:
    return store.snapshot_before(now.timestamp() + 1)


# Weekoverzicht

def week_due(store: Store, now: datetime) -> bool:
    if not enabled(store, "week") or now.weekday() != WEEK_DAY or now.hour < WEEK_HOUR:
        return False
    return store.get_setting("week.sent") != _week(now)


def _week(now: datetime) -> str:
    iso = now.isocalendar()
    return f"{iso.year}-W{iso.week}"


def weekly(store: Store, now: datetime) -> dict | None:
    """Verandering sinds maandag 00:00; None als er nog te weinig gegevens zijn."""
    if not week_due(store, now):
        return None
    store.set_setting("week.sent", _week(now))
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    start, end = store.snapshot_before(monday.timestamp()), _latest(store, now)
    if not start or not end or end[0] <= monday.timestamp():
        return None
    diff = end[1] - start[1]
    pct = diff / start[1] * 100 if start[1] else 0
    fire = end[1] / goal(store) * 100
    body = f"{_eur(diff, signed=True)} ({_pct(pct)}) deze week. Totaal {_eur(end[1])}, FIRE-doel nu {fire:.0f}%."
    if movers := week_movers(store, monday):
        best, worst = movers
        body += f" Beste: {best[0]} {_pct(best[1])}" + (f", slechtste: {worst[0]} {_pct(worst[1])}." if worst != best else ".")
    return notify.add(store, f"Weekoverzicht · week {now.isocalendar().week}", body, "info")


def record_prices(store: Store, positions: list[dict], now: datetime) -> None:
    """Eén koers per positie per dag bewaren (de laatste van die dag)."""
    rows = [(p["id"], p["tk"], float(p["price"])) for p in positions if p.get("cat") in ("eq", "cr") and p.get("price")]
    if rows:
        store.add_pos_snaps(now.date().isoformat(), rows)


def week_movers(store: Store, monday: datetime) -> tuple[tuple[str, float], tuple[str, float]] | None:
    """(tk, %) van de beste en slechtste positie sinds maandag, op koers (niet op bijkopen)."""
    first: dict[str, tuple[str, float]] = {}
    last: dict[str, float] = {}
    for _, pid, tk, price in store.pos_snaps(monday.date().isoformat()):
        first.setdefault(pid, (tk, price))
        last[pid] = price
    changes = [(tk, (last[pid] / p0 - 1) * 100) for pid, (tk, p0) in first.items() if p0 and pid in last]
    if not changes:
        return None
    changes.sort(key=lambda x: x[1])
    return changes[-1], changes[0]


# Mijlpalen (elke 10% van het FIRE-doel)

def milestone(store: Store, now: datetime) -> dict | None:
    latest = _latest(store, now)
    if not latest:
        return None
    step = int(min(latest[1] / goal(store), 1.0) * 10)  # 0–10
    seen = store.get_setting("goal.step")
    if seen is None or step < seen:
        store.set_setting("goal.step", step)  # eerste keer (of gedaald): alleen onthouden
        return None
    if step == seen:
        return None
    store.set_setting("goal.step", step)
    if not enabled(store, "goal"):
        return None
    title = "FIRE-doel bereikt!" if step == 10 else "Mijlpaal bereikt"
    body = f"Je hebt {step * 10}% van je FIRE-doel: {_eur(latest[1])} van {_eur(goal(store))}."
    return notify.add(store, title, body, "ok")


# Grote dagbeweging van een positie (ontwerp: "bij ±5% beweging van een positie")

MOVE_KEY = "notify.move"
DEFAULT_MOVE = 5.0


def moves(store: Store, positions: list[dict], now: datetime) -> list[dict]:
    """Eén melding per positie per dag als die vandaag meer dan ±5% beweegt (valt onder koersalerts)."""
    if not enabled(store, "price"):
        return []
    limit = float(store.get_setting(MOVE_KEY, DEFAULT_MOVE))
    today = now.date().isoformat()
    sent_today = store.get_setting("move.sent") or {}
    if sent_today.get("date") != today:
        sent_today = {"date": today, "ids": []}
    out = []
    for p in positions:
        chg = p.get("dayChange")
        if chg is None or abs(chg) < limit or p["id"] in sent_today["ids"] or p.get("cat") not in ("eq", "cr"):
            continue
        sent_today["ids"].append(p["id"])
        word = "stijgt" if chg > 0 else "daalt"
        body = f"{p['name']} {word} {_pct(chg)[1:]} vandaag. Waarde nu {_eur(float(p.get('value') or 0))}."
        out.append(notify.add(store, f"{p['tk']} {_pct(chg)} vandaag", body, "info"))
    store.set_setting("move.sent", sent_today)
    return out


# Dividend (Trading 212)

def _tk(ticker: str) -> str:
    base = ticker.split("_")[0]
    return base[:-1] if len(base) > 1 and base[-1].islower() else base


async def dividends(store: Store, client: httpx.AsyncClient, now: float | None = None) -> list[dict]:
    """Nieuwe dividenden melden. De eerste keer alleen onthouden wat er al was."""
    now = now or time.time()
    secret = store.get_secret("t212")
    checked = store.get_setting("div.checked")
    if not secret or (checked is not None and now - checked < DIVIDEND_EVERY):
        return []
    store.set_setting("div.checked", now)
    base = trading212.DEMO if secret.get("demo") else trading212.LIVE
    headers = trading212.auth_header(secret["key"], secret.get("secret"))
    try:
        data = await trading212.request(client, base, "GET", "/history/dividends?limit=50", headers)
    except trading212.T212Error as e:
        log.info("Dividend ophalen lukt niet: %s", e)
        return []
    items = (data or {}).get("items", []) if isinstance(data, dict) else []
    seen = store.get_setting("div.seen")
    refs = [str(i.get("reference") or f"{i.get('ticker')}-{i.get('paidOn')}") for i in items]
    store.set_setting("div.seen", (refs + [r for r in (seen or []) if r not in refs])[:KEEP_SEEN])
    if seen is None or not enabled(store, "div"):
        return []
    sent = []
    for item, ref in zip(items, refs):
        if ref in seen:
            continue
        amount = item.get("amountInEuro") if item.get("amountInEuro") is not None else item.get("amount")
        if amount is None:
            continue
        money = f"€ {float(amount):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        sent.append(notify.add(store, "Dividend ontvangen", f"{money} van {_tk(str(item.get('ticker', '')))} op Trading 212.", "ok"))
    return sent


async def loop(store: Store, client: httpx.AsyncClient) -> None:
    await asyncio.sleep(90)  # eerst rustig opstarten
    while True:
        try:
            now = datetime.now(config.TZ)
            weekly(store, now)
            milestone(store, now)
            await dividends(store, client)
            positions = (await portfolio.build(store, client))["positions"]
            moves(store, positions, now)
            record_prices(store, positions, now)
            from . import fills  # hier pas: fills gebruikt zelf digest
            await fills.check(store, client)
        except Exception:  # noqa: BLE001
            log.exception("Meldingen: onverwachte fout")
        await asyncio.sleep(CHECK_EVERY)
