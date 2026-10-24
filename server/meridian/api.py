"""HTTP-API voor de app. Alles behalve /api/health en /api/koppel vraagt de apparaat-sleutel."""

import os
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__, auth, config, portfolio, prices, trading
from .store import Store

state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.master_key(create=True)  # eerste start: hoofdsleutel aanmaken als die er nog niet is
    state.setdefault("store", Store())
    state["client"] = httpx.AsyncClient(timeout=15, headers={"User-Agent": f"meridian/{__version__}"})
    yield
    await state["client"].aclose()


app = FastAPI(title="Meridian", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None)

# Alleen voor testen met de webversie van de app; de telefoon-app heeft dit niet nodig.
if origins := os.environ.get("MERIDIAN_CORS_ORIGINS"):
    app.add_middleware(CORSMiddleware, allow_origins=origins.split(","), allow_methods=["GET", "POST"], allow_headers=["Authorization", "Content-Type"])


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
    return {"connected": trading.connected(s), "live": trading.LIVE_ALLOWED,
            "dayMax": trading.day_max(s), "usedToday": round(trading.used_today(s), 2)}


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
