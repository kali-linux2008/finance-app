"""Melding als een limietorder is uitgevoerd.

De server onthoudt welke limietorders openstaan. Verdwijnt er een uit de lijst, dan vraagt hij
bij de broker na wat ermee gebeurd is: uitgevoerd geeft een melding, geannuleerd niet.
"""

import logging

import httpx

from . import digest, notify, trading
from .sources import okx, trading212
from .store import Store

log = logging.getLogger("meridian.fills")

KEY = "orders.open"


def _fmt_qty(q: float) -> str:
    return f"{q:.6f}".rstrip("0").rstrip(".").replace(".", ",")


async def _t212_status(client: httpx.AsyncClient, store: Store, order_id: str) -> dict | None:
    base, headers = trading._t212(trading.trade_secret(store, "t212"))
    data = await trading212.request(client, base, "GET", "/equity/history/orders?limit=50", headers) or {}
    for item in data.get("items", []) if isinstance(data, dict) else []:
        order = item.get("order", item)  # nieuwere API: {"order": {...}, "fill": {...}}
        if str(order.get("id")) == order_id:
            fill = item.get("fill") or {}
            return {"status": str(order.get("status", "")).upper(),
                    "filled": abs(float(order.get("filledQuantity") or fill.get("quantity") or 0)),
                    "price": fill.get("price") or order.get("fillPrice")}
    return None


async def _okx_status(client: httpx.AsyncClient, store: Store, inst: str, ord_id: str) -> dict | None:
    rows = await okx.request(client, trading.trade_secret(store, "okx"), "GET", "/api/v5/trade/order",
                             {"instId": inst, "ordId": ord_id})
    if not rows:
        return None
    r = rows[0]
    state = {"filled": "FILLED", "canceled": "CANCELLED", "mmp_canceled": "CANCELLED"}.get(r.get("state"), str(r.get("state", "")).upper())
    return {"status": state, "filled": float(r.get("accFillSz") or 0), "price": r.get("avgPx") or r.get("px")}


async def status(client: httpx.AsyncClient, store: Store, order: dict) -> dict | None:
    broker, *rest = order["id"].split(":")
    if broker == "t212":
        return await _t212_status(client, store, rest[0])
    return await _okx_status(client, store, rest[0], rest[1])


async def check(store: Store, client: httpx.AsyncClient) -> list[dict]:
    if not any(store.get_secret(sid) for sid in trading.SECRET_IDS.values()):
        return []
    res = await trading.open_orders(store, client)
    ok_brokers = {b["id"] for b in res["brokers"] if b["connected"] and not b["error"]}
    now = {o["id"]: o for o in res["orders"] if o["type"] == "limiet"}
    before: dict = store.get_setting(KEY) or {}
    # Alleen brokers die nu goed antwoordden vergelijken; bij een storing niets concluderen.
    keep = {i: o for i, o in before.items() if o["broker"] not in ok_brokers}
    store.set_setting(KEY, {**keep, **now})
    sent = []
    for oid, o in before.items():
        if o["broker"] not in ok_brokers or oid in now:
            continue
        try:
            st = await status(client, store, o)
        except (trading.TradeError, trading212.T212Error, okx.OkxError, httpx.HTTPError) as e:
            log.info("Status van order %s onbekend: %s", oid, e)
            continue
        if not st or st["status"] != "FILLED" or not digest.enabled(store, "order"):
            continue
        qty = st["filled"] or o["qty"]
        price = f" voor {trading._eur(float(st['price']))} per stuk" if st.get("price") and o.get("cur", "EUR") == "EUR" else ""
        verb = "gekocht" if o["side"] == "kopen" else "verkocht"
        sent.append(notify.add(store, "Limietorder uitgevoerd",
                               f"{_fmt_qty(qty)} {o['tk']} {verb}{price} via {trading.NAMES[o['broker']]}.", "ok"))
    return sent
