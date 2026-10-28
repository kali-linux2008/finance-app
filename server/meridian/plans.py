"""Periodiek inleggen: elke maand op een vaste dag automatisch dezelfde bedragen kopen.

Veiligheid:
- De app kan het plan maken en wijzigen (bevestigd met vingerafdruk of pincode), maar het
  automatisch kopen moet je één keer zelf op de server aanzetten (`handel periodiek aan`).
- Eigen maandmaximum (standaard € 400). Een plan dat daarboven komt, wordt niet uitgevoerd.
- Elke regel krijgt een vaste order-id per maand ("plan-2026-10-…"): dezelfde maand wordt
  nooit twee keer gekocht, ook niet na een herstart.
- Staat er te weinig vrij saldo, dan koopt de server niets (niet half) en probeert hij het
  de volgende werkdag opnieuw.
"""

import asyncio
import logging
import time
from datetime import date, datetime, timedelta
from datetime import time as clock

import httpx

from . import config, notify, trading
from .store import Store

log = logging.getLogger("meridian.plan")

DEFAULT_MONTH_MAX = 400.0
DEFAULT_DAY = 25
# Amsterdamse tijd waarin zowel Xetra (VWCE, Rheinmetall) als de Amerikaanse beurzen open zijn.
RUN_FROM, RUN_UNTIL = clock(15, 45), clock(17, 25)
CHECK_EVERY = 300  # seconden
GAP = 3.0  # pauze tussen orders, tegen "te veel verzoeken"
KEEP_RUNS = 12


def get_plan(store: Store) -> dict:
    return store.get_setting("plan") or {"active": False, "day": DEFAULT_DAY, "lines": []}


def enabled(store: Store) -> bool:
    return bool(store.get_setting("plan.enabled", False))


def month_max(store: Store) -> float:
    return float(store.get_setting("plan.monthmax", DEFAULT_MONTH_MAX))


def total(plan: dict) -> float:
    return round(sum(line["amount"] for line in plan.get("lines", [])), 2)


def due_date(day: int, year: int, month: int) -> date:
    """De inlegdag in deze maand; valt hij in het weekend, dan de maandag erna
    (of de vrijdag ervoor, als de maandag al in de volgende maand valt)."""
    d = date(year, month, min(max(day, 1), 28))
    step = 1 if (d + timedelta(days=7 - d.weekday())).month == month else -1
    while d.weekday() >= 5:
        d += timedelta(days=step)
    return d


def _month(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def next_run(store: Store, now: datetime | None = None) -> float | None:
    """Tijdstip (epoch) van de volgende inleg, of None als het plan niet loopt."""
    plan = get_plan(store)
    if not plan["active"] or not plan["lines"]:
        return None
    now = now or datetime.now(config.TZ)
    today = now.date()
    d = due_date(plan["day"], today.year, today.month)
    if store.get_setting("plan.done") == _month(today):
        nxt = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
        d = due_date(plan["day"], nxt.year, nxt.month)
    elif d < today or (d == today and (now.time() > RUN_UNTIL or store.get_setting("plan.tried") == today.isoformat())):
        # Gemist of niet gelukt (bijv. saldo te laag of server uit): de volgende werkdag opnieuw.
        d = today + timedelta(days=1)
        while d.weekday() >= 5:
            d += timedelta(days=1)
    return datetime.combine(d, RUN_FROM, config.TZ).timestamp()


def is_due(store: Store, now: datetime) -> bool:
    plan = get_plan(store)
    if not (plan["active"] and plan["lines"] and enabled(store)):
        return False
    today = now.date()
    if store.get_setting("plan.done") == _month(today) or store.get_setting("plan.tried") == today.isoformat():
        return False
    return today >= due_date(plan["day"], today.year, today.month) and today.weekday() < 5 \
        and RUN_FROM <= now.time() <= RUN_UNTIL


def validate(store: Store, data: dict) -> dict:
    """Controleert een plan uit de app. Geeft het nette plan terug of gooit TradeError."""
    day = int(data.get("day", DEFAULT_DAY))
    if not 1 <= day <= 28:
        raise trading.TradeError("Kies een dag tussen 1 en 28.")
    lines, seen = [], set()
    for line in data.get("lines", []):
        pid, amount = str(line.get("posId", "")), round(float(line.get("amount", 0)), 2)
        if not pid or pid in seen:
            raise trading.TradeError("Elke belegging mag maar één keer in het plan staan.")
        if amount < trading.MIN_EUR:
            raise trading.TradeError("Elk bedrag moet minimaal € 1 zijn.")
        seen.add(pid)
        lines.append({"posId": pid, "tk": str(line.get("tk", ""))[:12], "name": str(line.get("name", ""))[:60], "amount": amount})
    plan = {"active": bool(data.get("active")), "day": day, "lines": lines}
    if total(plan) > month_max(store) + 0.005:
        raise trading.TradeError(f"Het plan ({trading._eur(total(plan))}) is hoger dan het maandmaximum van "
                                 f"{trading._eur(month_max(store))}. Aanpassen op de server: "
                                 "python -m meridian handel periodiek maximum <bedrag>")
    return plan


async def run(store: Store, client: httpx.AsyncClient, now: datetime, sleep=asyncio.sleep) -> dict:
    """Voert de inleg van deze maand uit. Geeft het verslag terug (ook bewaard voor de app)."""
    plan, today = get_plan(store), now.date()
    report = {"month": _month(today), "at": time.time(), "total": total(plan), "lines": [], "ok": False, "message": None}
    store.set_setting("plan.tried", today.isoformat())  # hooguit één poging per dag

    if total(plan) > month_max(store) + 0.005:
        report["message"] = f"Niet uitgevoerd: plan is hoger dan het maandmaximum ({trading._eur(month_max(store))})."
        return await _finish(store, client, report)

    # Eerst kijken of er genoeg vrij saldo is; liever niets kopen dan half.
    try:
        need = sum(line["amount"] for line in plan["lines"])
        secret = trading.trade_secret(store, "t212")
        _, cash = await trading._t212_account(client, secret, "")
        if cash + 0.005 < need:
            report["message"] = f"Niet uitgevoerd: {trading._eur(cash)} vrij, {trading._eur(need)} nodig. Morgen opnieuw."
            return await _finish(store, client, report)
    except Exception as e:  # noqa: BLE001 - een melding is beter dan een vastgelopen planner
        report["message"] = f"Niet uitgevoerd: {trading._describe(e)}"
        return await _finish(store, client, report)

    for i, line in enumerate(plan["lines"]):
        if i:
            await sleep(GAP)
        req = trading.OrderRequest(line["posId"], "kopen", line["amount"], "markt", 0.0,
                                   f"plan-{report['month']}-{line['posId']}"[:64])
        try:
            res = await trading.place(store, client, req, plan=True)
            report["lines"].append({**line, "ok": res["ok"], "message": res.get("message")})
        except trading.TradeError as e:
            report["lines"].append({**line, "ok": False, "message": str(e)})
    report["ok"] = all(r["ok"] for r in report["lines"])
    failed = [r["tk"] or r["posId"] for r in report["lines"] if not r["ok"]]
    report["message"] = "Alles gekocht." if not failed else f"Niet gelukt: {', '.join(failed)}. Zie de details."
    store.set_setting("plan.done", report["month"])  # deze maand is klaar; mislukte regels koop je zelf bij
    return await _finish(store, client, report)


async def _finish(store: Store, client: httpx.AsyncClient, report: dict) -> dict:
    _save_report(store, report)
    title = "Inleg gelukt" if report["ok"] else "Inleg niet (helemaal) gelukt"
    body = f"{trading._eur(report['total'])} belegd." if report["ok"] else report["message"]
    await notify.send(store, client, title, body, "ok" if report["ok"] else "warning")
    return report


def _save_report(store: Store, report: dict) -> dict:
    runs = [report] + (store.get_setting("plan.runs") or [])
    store.set_setting("plan.runs", runs[:KEEP_RUNS])
    log.info("Periodiek inleggen %s: %s", report["month"], report["message"])
    return report


PRECHECK_HOUR = 9  # de dag vóór de inleg, vanaf 09:00


async def precheck(store: Store, client: httpx.AsyncClient, now: datetime) -> dict | None:
    """Een dag van tevoren kijken of er genoeg vrij saldo is; zo niet, dan een waarschuwing.
    Zo kun je nog op tijd geld overmaken (een overboeking duurt vaak een werkdag)."""
    plan = get_plan(store)
    nxt = next_run(store, now)
    if not (enabled(store) and plan["active"] and plan["lines"] and nxt):
        return None
    run_day = datetime.fromtimestamp(nxt, config.TZ).date()
    if (run_day - now.date()).days != 1 or now.hour < PRECHECK_HOUR:
        return None
    if store.get_setting("plan.prechecked") == run_day.isoformat():
        return None
    store.set_setting("plan.prechecked", run_day.isoformat())
    need = total(plan)
    try:
        _, cash = await trading._t212_account(client, trading.trade_secret(store, "t212"), "")
    except Exception as e:  # noqa: BLE001
        return notify.add(store, "Inleg morgen: saldo onbekend", f"Ik kon je vrije saldo niet bekijken: {trading._describe(e)}", "warning")
    if cash + 0.005 >= need:
        return None
    return notify.add(store, "Inleg morgen: te weinig saldo",
                      f"Morgen leg je {trading._eur(need)} in, maar er staat {trading._eur(cash)} vrij op Trading 212. "
                      f"Maak nog {trading._eur(need - cash)} over, anders wordt er niets gekocht.", "warning")


async def loop(store: Store, client: httpx.AsyncClient) -> None:
    """Draait zolang de server draait en kijkt elke 5 minuten of er ingelegd moet worden."""
    while True:
        try:
            now = datetime.now(config.TZ)
            await precheck(store, client, now)
            if is_due(store, now):
                await run(store, client, now)
        except Exception:  # noqa: BLE001
            log.exception("Periodiek inleggen: onverwachte fout")
        await asyncio.sleep(CHECK_EVERY)
