"""HTTP-API voor de app. Alles behalve /api/health en /api/koppel vraagt de apparaat-sleutel."""

import os
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import asyncio

from . import __version__, alerts, appupdate, auth, config, digest, maintenance, notify, plans, portfolio, prices, rebalance, reminders, trading
from .sources import rabocsv
from .store import Store

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.master_key(create=True)  # eerste start: hoofdsleutel aanmaken als die er nog niet is
    state.setdefault("store", Store())
    state["client"] = httpx.AsyncClient(timeout=15, headers={"User-Agent": f"meridian/{__version__}"})
    tasks = [asyncio.create_task(plans.loop(state["store"], state["client"])),  # periodiek inleggen
             asyncio.create_task(appupdate.loop(state["store"])),  # nieuwe app-versie melden
             asyncio.create_task(alerts.loop(state["store"], state["client"])),  # koersalerts
             asyncio.create_task(reminders.loop(state["store"])),  # wekelijkse herinnering Rabo-CSV
             asyncio.create_task(digest.loop(state["store"], state["client"])),  # weekoverzicht, mijlpalen, dividend
             asyncio.create_task(maintenance.loop(state["store"], state["client"]))]  # back-up, bronnen bijwerken
    yield
    for t in tasks:
        t.cancel()
    await state["client"].aclose()


app = FastAPI(title="Meridian", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None)

# Alleen voor testen met de webversie van de app; de telefoon-app heeft dit niet nodig.
if origins := os.environ.get("MERIDIAN_CORS_ORIGINS"):
    app.add_middleware(CORSMiddleware, allow_origins=origins.split(","), allow_methods=["GET", "POST", "PUT"], allow_headers=["Authorization", "Content-Type"])


def store() -> Store:
    return state["store"]


def client() -> httpx.AsyncClient:
    return state["client"]


def device(authorization: str = Header(default=""), s: Store = Depends(store)) -> None:
    token = authorization.removeprefix("Bearer ").strip()
    if not token or not auth.check_token(s, token):
        raise HTTPException(401, "Niet gekoppeld. Koppel de app opnieuw met een koppelcode.")


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "name": "meridian", "version": __version__}


class PairBody(BaseModel):
    code: str
    device: str = "telefoon"


@app.post("/api/koppel")
def pair(body: PairBody, s: Store = Depends(store)) -> dict:
    token = auth.redeem_pair_code(s, body.code, body.device)
    if not token:
        raise HTTPException(403, "Koppelcode onjuist of verlopen. Maak een nieuwe op de server.")
    return {"token": token}


@app.get("/api/portfolio", dependencies=[Depends(device)])
async def get_portfolio(refresh: bool = False, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    return await portfolio.build(s, c, force=refresh)


Period = Literal["1D", "1W", "1M", "1J", "Alles"]


@app.get("/api/history", dependencies=[Depends(device)])
def get_history(period: Period = "Alles", s: Store = Depends(store)) -> dict:
    return {"points": [{"t": t, "v": v} for t, v in portfolio.history(s, period)]}


@app.get("/api/candles/{ccy}", dependencies=[Depends(device)])
async def get_candles(ccy: str, period: Period = "1J", c: httpx.AsyncClient = Depends(client)) -> dict:
    if not ccy.isalnum() or len(ccy) > 10:
        raise HTTPException(400, "Ongeldige munt")
    try:
        pts = await prices.candles(c, ccy.upper(), period)
    except prices.PriceError as e:
        raise HTTPException(404, str(e)) from e
    if not pts:
        raise HTTPException(404, f"Geen koershistorie voor {ccy}")
    return {"points": [{"t": t, "v": v} for t, v in pts]}


@app.get("/api/candles/{ccy}/ohlc", dependencies=[Depends(device)])
async def get_ohlc(ccy: str, c: httpx.AsyncClient = Depends(client)) -> dict:
    if not ccy.isalnum() or len(ccy) > 10:
        raise HTTPException(400, "Ongeldige munt")
    try:
        return {"candles": await prices.ohlc(c, ccy.upper())}
    except prices.PriceError as e:
        raise HTTPException(404, str(e)) from e


# Handelen (stap 5: alleen oefengeld). De app bevestigt elke order eerst met vingerafdruk of pincode.

def _trade_error(e: trading.TradeError) -> HTTPException:
    return HTTPException(e.status, str(e))


@app.get("/api/handel", dependencies=[Depends(device)])
def trade_info(s: Store = Depends(store)) -> dict:
    return {"connected": trading.connected(s), "live": trading.live_allowed(s),
            "demo": {b: trading.is_demo(s, b) for b in trading.SECRET_IDS},
            "dayMax": trading.day_max(s), "usedToday": round(trading.used_today(s), 2),
            "liveDayMax": trading.day_max(s, False), "liveUsedToday": round(trading.used_today(s, False), 2)}


@app.get("/api/handel/positie/{pos_id}", dependencies=[Depends(device)])
async def trade_quote(pos_id: str, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    try:
        return await trading.quote(s, c, pos_id)
    except trading.TradeError as e:
        raise _trade_error(e) from e


class OrderBody(BaseModel):
    posId: str
    side: Literal["kopen", "verkopen"]
    amount: float
    type: Literal["markt", "limiet"] = "markt"
    limitPct: float = 0
    requestId: str


@app.post("/api/handel/order", dependencies=[Depends(device)])
async def trade_order(body: OrderBody, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    req = trading.OrderRequest(body.posId, body.side, body.amount, body.type, body.limitPct, body.requestId[:64])
    try:
        return await trading.place(s, c, req)
    except trading.TradeError as e:
        raise _trade_error(e) from e


@app.get("/api/handel/orders", dependencies=[Depends(device)])
async def trade_orders(s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    return await trading.open_orders(s, c)


class OrderRef(BaseModel):
    id: str
    limit: float | None = None


@app.post("/api/handel/orders/annuleer", dependencies=[Depends(device)])
async def trade_cancel(body: OrderRef, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    try:
        return await trading.cancel(s, c, body.id)
    except trading.TradeError as e:
        raise _trade_error(e) from e


@app.post("/api/handel/orders/limiet", dependencies=[Depends(device)])
async def trade_amend(body: OrderRef, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    if body.limit is None:
        raise HTTPException(422, "Geef een nieuwe limiet op")
    try:
        return await trading.amend(s, c, body.id, body.limit)
    except trading.TradeError as e:
        raise _trade_error(e) from e


# Periodiek inleggen. Het automatisch kopen zelf zet je aan op de server (handel periodiek aan).

def _plan_state(s: Store) -> dict:
    plan = plans.get_plan(s)
    return {"plan": plan, "total": plans.total(plan), "enabled": plans.enabled(s), "monthMax": plans.month_max(s),
            "nextRun": plans.next_run(s), "runs": s.get_setting("plan.runs") or []}


@app.get("/api/plan", dependencies=[Depends(device)])
def get_plan(s: Store = Depends(store)) -> dict:
    return _plan_state(s)


class PlanLine(BaseModel):
    posId: str
    amount: float
    tk: str = ""
    name: str = ""


class PlanBody(BaseModel):
    active: bool
    day: int = plans.DEFAULT_DAY
    lines: list[PlanLine]


@app.put("/api/plan", dependencies=[Depends(device)])
async def put_plan(body: PlanBody, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    try:
        plan = plans.validate(s, body.model_dump())
        for line in plan["lines"]:
            prod = await trading.find_product(s, c, line["posId"])
            if prod.broker != "t212":
                raise trading.TradeError(f"{prod.tk}: periodiek inleggen kan voorlopig alleen bij Trading 212.")
            line["tk"], line["name"] = prod.tk, prod.name
    except trading.TradeError as e:
        raise _trade_error(e) from e
    s.set_setting("plan", plan)
    return _plan_state(s)


# Meldingen: de app haalt ze zelf op (op de achtergrond en bij openen).

@app.get("/api/meldingen", dependencies=[Depends(device)])
def get_events(na: int = 0, s: Store = Depends(store)) -> dict:
    return {"events": notify.events(s, na)}


class NotifySettings(BaseModel):
    types: dict[str, bool] = {}
    goal: float | None = None


def _notify_settings(s: Store) -> dict:
    return {
        "types": digest.types(s),
        "labels": digest.TYPES,
        "goal": digest.goal(s),
        "csvReminder": reminders.describe(s),
    }


@app.get("/api/meldingen/instellingen", dependencies=[Depends(device)])
def get_notify_settings(s: Store = Depends(store)) -> dict:
    return _notify_settings(s)


@app.put("/api/meldingen/instellingen", dependencies=[Depends(device)])
def put_notify_settings(body: NotifySettings, s: Store = Depends(store)) -> dict:
    digest.set_types(s, body.types)
    if body.goal is not None:
        if not 1000 <= body.goal <= 100_000_000:
            raise HTTPException(400, "Kies een FIRE-doel tussen € 1.000 en € 100 miljoen.")
        s.set_setting(digest.GOAL_KEY, round(body.goal, 2))
        s.set_setting("goal.step", None)  # nieuw doel: mijlpalen opnieuw beginnen
    return _notify_settings(s)


# Koersalerts en volglijst (alleen eigen bezit en crypto via OKX).

class AlertBody(BaseModel):
    key: str
    dir: Literal["boven", "onder"]
    price: float
    repeat: bool = False


class KeyBody(BaseModel):
    key: str


class IdBody(BaseModel):
    id: str


def _alert_error(e: alerts.AlertError) -> HTTPException:
    return HTTPException(400, str(e))


@app.get("/api/koers", dependencies=[Depends(device)])
async def get_quote(key: str, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    q = (await alerts.quotes(s, c, [key])).get(key)
    if not q:
        raise HTTPException(404, "Geen koers gevonden voor deze belegging.")
    return {**q, "alerts": [a for a in alerts.get_alerts(s) if a["key"] == key]}


@app.get("/api/alerts", dependencies=[Depends(device)])
def get_alerts(s: Store = Depends(store)) -> dict:
    return {"alerts": alerts.get_alerts(s)}


@app.post("/api/alerts", dependencies=[Depends(device)])
async def post_alert(body: AlertBody, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    try:
        alert = await alerts.add_alert(s, c, body.model_dump())
    except alerts.AlertError as e:
        raise _alert_error(e) from e
    return {"alert": alert, "alerts": alerts.get_alerts(s)}


@app.post("/api/alerts/verwijder", dependencies=[Depends(device)])
def delete_alert(body: IdBody, s: Store = Depends(store)) -> dict:
    alerts.remove_alert(s, body.id)
    return {"alerts": alerts.get_alerts(s)}


@app.get("/api/volglijst", dependencies=[Depends(device)])
async def get_watch(s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    return await alerts.watch_state(s, c)


@app.post("/api/volglijst", dependencies=[Depends(device)])
async def post_watch(body: KeyBody, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    try:
        await alerts.add_watch(s, c, body.key)
    except alerts.AlertError as e:
        raise _alert_error(e) from e
    return await alerts.watch_state(s, c)


@app.post("/api/volglijst/verwijder", dependencies=[Depends(device)])
async def delete_watch(body: KeyBody, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    alerts.remove_watch(s, body.key)
    return await alerts.watch_state(s, c)


@app.get("/api/zoek", dependencies=[Depends(device)])
async def search(q: str = "", s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    return {"results": await alerts.search(s, c, q[:40])}


# Rabobank-CSV (voor rekeningen die de bankkoppeling niet doorgeeft, zoals de spaarrekening).

class CsvBody(BaseModel):
    text: str


def _csv_state(s: Store) -> dict:
    st = rabocsv.state(s)
    return {
        "accounts": [{"iban": f"…{i[-4:]}", "balance": v["balance"], "date": v["date"]} for i, v in sorted(st["accounts"].items())],
        "uploaded": st.get("uploaded"),
        "reminder": reminders.describe(s),
    }


@app.get("/api/bank/csv", dependencies=[Depends(device)])
def get_csv(s: Store = Depends(store)) -> dict:
    return _csv_state(s)


@app.post("/api/bank/csv", dependencies=[Depends(device)])
def post_csv(body: CsvBody, s: Store = Depends(store)) -> dict:
    if len(body.text) > rabocsv.MAX_BYTES:
        raise HTTPException(400, "Dit bestand is te groot. Download een kortere periode (bijv. de laatste maand).")
    try:
        found = rabocsv.parse(body.text)
    except rabocsv.CsvError as e:
        raise HTTPException(400, str(e)) from e
    rabocsv.save(s, found)
    return {**_csv_state(s), "found": len(found)}


# Herbalanceren: doelverdeling, advies bij bijkopen en voorgestelde orders.

class TargetsBody(BaseModel):
    targets: dict[str, float]


class RebalanceBody(BaseModel):
    orders: list[dict]
    requestId: str


@app.get("/api/herbalanceren", dependencies=[Depends(device)])
async def get_rebalance(bedrag: float | None = None, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    targets = rebalance.get_targets(s)
    data = await portfolio.build(s, c)
    out = {"targets": targets, "classes": rebalance.CLASSES, "current": rebalance.current(data["positions"]),
           "rows": None, "buyOnly": None, "proposals": None}
    if not targets:
        return out
    amount = bedrag if bedrag is not None else plans.total(plans.get_plan(s))
    rows = rebalance.analyse(data["positions"], targets)
    out.update(rows=rows, amount=amount, buyOnly=rebalance.buy_only(rows, amount),
               proposals=rebalance.proposals(data["positions"], rows))
    return out


@app.put("/api/herbalanceren", dependencies=[Depends(device)])
def put_rebalance(body: TargetsBody, s: Store = Depends(store)) -> dict:
    try:
        targets = rebalance.validate(body.targets)
    except rebalance.RebalanceError as e:
        raise HTTPException(400, str(e)) from e
    s.set_setting(rebalance.KEY, targets)
    return {"targets": targets}


@app.post("/api/herbalanceren/uitvoeren", dependencies=[Depends(device)])
async def post_rebalance(body: RebalanceBody, s: Store = Depends(store), c: httpx.AsyncClient = Depends(client)) -> dict:
    try:
        results = await rebalance.execute(s, c, body.orders, body.requestId)
    except rebalance.RebalanceError as e:
        raise HTTPException(400, str(e)) from e
    return {"results": results, "ok": all(r["ok"] for r in results)}


# App-updates: de nieuwste APK die op de server is gebouwd.

@app.get("/api/app", dependencies=[Depends(device)])
def get_app() -> dict:
    return {"available": appupdate.info()}


@app.get("/api/app/apk", dependencies=[Depends(device)])
def get_apk() -> FileResponse:
    if not appupdate.info():
        raise HTTPException(404, "Er staat geen nieuwe app klaar. Bouw hem op de server met build/android/bouw.sh.")
    return FileResponse(appupdate.apk_path(), media_type="application/vnd.android.package-archive", filename="meridian.apk")
