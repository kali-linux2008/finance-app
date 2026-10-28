from datetime import datetime

import httpx
import respx

from meridian import config, digest, fills, notify
from meridian.sources import trading212

T212 = trading212.DEMO
OPEN = [{"id": 11, "ticker": "VWCEd_EQ", "quantity": 0.5, "type": "LIMIT", "limitPrice": 118.0, "status": "NEW", "filledQuantity": 0}]


@respx.mock
async def test_filled_limit_order_is_reported_once(store):
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": True})
    pending = respx.get(f"{T212}/equity/orders").respond(json=OPEN)
    async with httpx.AsyncClient() as c:
        assert await fills.check(store, c) == []  # eerste keer: onthouden wat openstaat
        assert list(store.get_setting(fills.KEY)) == ["t212:11"]
        pending.respond(json=[])
        respx.get(f"{T212}/equity/history/orders").respond(json={"items": [
            {"order": {"id": 11, "status": "FILLED", "filledQuantity": 0.5}, "fill": {"price": 117.9, "quantity": 0.5}}]})
        sent = await fills.check(store, c)
        assert [e["body"] for e in sent] == ["0,5 VWCE gekocht voor € 117,90 per stuk via Trading 212."]
        assert await fills.check(store, c) == []


@respx.mock
async def test_cancelled_or_outage_gives_no_message(store):
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": True})
    pending = respx.get(f"{T212}/equity/orders").respond(json=OPEN)
    async with httpx.AsyncClient() as c:
        await fills.check(store, c)
        pending.respond(500)  # storing: niets concluderen, order blijft onthouden
        assert await fills.check(store, c) == [] and "t212:11" in store.get_setting(fills.KEY)
        pending.respond(json=[])
        respx.get(f"{T212}/equity/history/orders").respond(json={"items": [{"id": 11, "status": "CANCELLED"}]})
        assert await fills.check(store, c) == []
    assert notify.events(store) == []


@respx.mock
async def test_okx_fill(store, monkeypatch):
    store.set_secret("okx.handel", {"key": "K", "secret": "S", "passphrase": "P", "demo": True, "domain": config.OKX_URL})
    pend = respx.get(f"{config.OKX_URL}/api/v5/trade/orders-pending").respond(json={"code": "0", "data": [
        {"instId": "BTC-EUR", "ordId": "9", "side": "buy", "ordType": "limit", "sz": "0.001", "px": "80000", "state": "live"}]})
    async with httpx.AsyncClient() as c:
        await fills.check(store, c)
        pend.respond(json={"code": "0", "data": []})
        respx.get(f"{config.OKX_URL}/api/v5/trade/order").respond(json={"code": "0", "data": [
            {"state": "filled", "accFillSz": "0.001", "avgPx": "79950"}]})
        sent = await fills.check(store, c)
    assert sent[0]["body"] == "0,001 BTC gekocht voor € 79.950,00 per stuk via OKX."


def test_week_best_and_worst(store):
    monday = datetime(2026, 11, 2, tzinfo=config.TZ)
    pos = lambda vw, rh, bt: [{"id": "v", "tk": "VWCE", "cat": "eq", "price": vw}, {"id": "r", "tk": "RHM", "cat": "eq", "price": rh},  # noqa: E731
                              {"id": "b", "tk": "BTC", "cat": "cr", "price": bt}, {"id": "c", "tk": "EUR", "cat": "cash", "price": 1}]
    digest.record_prices(store, pos(100, 1600, 90000), monday)
    digest.record_prices(store, pos(101, 1500, 95000), datetime(2026, 11, 6, tzinfo=config.TZ))
    (best, b), (worst, w) = digest.week_movers(store, monday)
    assert (best, round(b, 1), worst, round(w, 2)) == ("BTC", 5.6, "RHM", -6.25)
    store.add_snapshot(60000, datetime(2026, 11, 1, 12, tzinfo=config.TZ).timestamp())
    store.add_snapshot(61000, datetime(2026, 11, 8, 17, tzinfo=config.TZ).timestamp())
    e = digest.weekly(store, datetime(2026, 11, 8, 18, 5, tzinfo=config.TZ))
    assert e["body"].endswith("Beste: BTC +5,6%, slechtste: RHM −6,2%.")
