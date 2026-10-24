import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from meridian import api, auth, portfolio, trading
from meridian.sources import trading212

T212 = trading212.DEMO
OKX = "https://eea.okx.com"

POSITIONS = [
    {"id": "t212-VWCEd_EQ", "tk": "VWCE", "name": "Vanguard FTSE All-World", "cls": "ETF", "cat": "eq", "src": "Trading 212",
     "value": 1280.4, "qty": 10, "price": 128.04, "cur": "EUR"},
    {"id": "t212-AAPL_US_EQ", "tk": "AAPL", "name": "Apple", "cls": "Aandeel", "cat": "eq", "src": "Trading 212",
     "value": 211.0, "qty": 1, "price": 245.1, "cur": "USD"},
    {"id": "btc", "tk": "BTC", "name": "Bitcoin", "cls": "Crypto", "cat": "cr", "src": "Trezor Safe 5 · OKX",
     "value": 9000, "qty": 0.1, "unit": "BTC", "price": 90000, "cur": "EUR"},
    {"id": "bank-0", "tk": "RABO", "name": "Rabobank", "cls": "Cash", "cat": "cash", "src": "Rabobank", "value": 500},
]


@pytest.fixture(autouse=True)
def setup(monkeypatch, store):
    async def build(s, c, force=False):
        return {"positions": POSITIONS}
    monkeypatch.setattr(portfolio, "build", build)
    trading._pairs.clear()
    trading._accounts.clear()
    import time as _t
    meta = {"VWCEd_EQ": {"ticker": "VWCEd_EQ", "minTradeQuantity": 0.01}, "AAPL_US_EQ": {"ticker": "AAPL_US_EQ", "minTradeQuantity": 0.01}}
    for base in (trading212.DEMO, trading212.LIVE):
        trading212._meta[base] = (_t.time(), meta)
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": True})
    store.set_secret("okx.handel", {"key": "K", "secret": "S", "passphrase": "P", "demo": True, "domain": OKX})


def t212_account(qty=10.0, cash=500.0):
    respx.get(f"{T212}/equity/positions").respond(json=[{"instrument": {"ticker": "VWCEd_EQ"}, "quantity": qty}])
    respx.get(f"{T212}/equity/account/summary").respond(json={"cash": {"availableToTrade": cash}})


def okx_ok(data):
    return httpx.Response(200, json={"code": "0", "data": data})


def okx_market(btc=0.05, eur=1000.0):
    respx.get(f"{OKX}/api/v5/public/instruments").respond(json={"code": "0", "data": [
        {"instId": "BTC-EUR", "state": "live", "lotSz": "0.00000001", "minSz": "0.00001", "tickSz": "0.1"}]})
    respx.get(f"{OKX}/api/v5/market/ticker").respond(json={"code": "0", "data": [{"last": "90000"}]})
    respx.get(f"{OKX}/api/v5/account/balance").respond(json={"code": "0", "data": [{"details": [
        {"ccy": "BTC", "availBal": str(btc)}, {"ccy": "EUR", "availBal": str(eur)}]}]})


def req(**kw):
    base = dict(pos_id="t212-VWCEd_EQ", side="kopen", amount=100.0, type="markt", limit_pct=0.0, request_id="r1")
    return trading.OrderRequest(**{**base, **kw})


@respx.mock
async def test_t212_market_buy_converts_euros_to_shares_and_logs(store):
    t212_account()
    order = respx.post(f"{T212}/equity/orders/market").respond(json={"id": 42, "status": "NEW"})
    async with httpx.AsyncClient() as c:
        res = await trading.place(store, c, req())
    body = json.loads(order.calls[0].request.content)
    assert body == {"ticker": "VWCEd_EQ", "quantity": 0.781, "extendedHours": False}  # € 100 / € 128,04, naar beneden
    assert res["ok"] and res["demo"] and res["orderId"] == "42"
    assert trading.used_today(store) == 100
    assert store.orders_log()[0]["action"] == "kopen"


@respx.mock
async def test_same_request_id_is_never_sent_twice(store):
    t212_account()
    order = respx.post(f"{T212}/equity/orders/market").respond(json={"id": 42})
    async with httpx.AsyncClient() as c:
        await trading.place(store, c, req())
        await trading.place(store, c, req())
    assert order.call_count == 1


@respx.mock
async def test_t212_limit_sell_uses_negative_quantity_and_price_in_instrument_currency(store):
    respx.get(f"{T212}/equity/positions").respond(json=[{"instrument": {"ticker": "AAPL_US_EQ"}, "quantity": 1}])
    respx.get(f"{T212}/equity/account/summary").respond(json={"cash": {"availableToTrade": 0}})
    order = respx.post(f"{T212}/equity/orders/limit").respond(json={"id": 7})
    async with httpx.AsyncClient() as c:
        await trading.place(store, c, req(pos_id="t212-AAPL_US_EQ", side="verkopen", amount=100, type="limiet", limit_pct=2))
    body = json.loads(order.calls[0].request.content)
    assert body["quantity"] < 0 and body["limitPrice"] == round(245.1 * 1.02, 2)
    assert body["timeValidity"] == "GOOD_TILL_CANCEL"


@respx.mock
async def test_t212_retries_with_fewer_decimals_on_precision_error(store):
    t212_account()
    order = respx.post(f"{T212}/equity/orders/market").mock(side_effect=[
        httpx.Response(400, json={"code": "QuantityPrecisionMismatch"}), httpx.Response(200, json={"id": 1})])
    async with httpx.AsyncClient() as c:
        res = await trading.place(store, c, req())
    assert order.call_count == 2 and json.loads(order.calls[1].request.content)["quantity"] == 0.78
    assert res["qty"] == 0.78


@respx.mock
async def test_checks_minimum_day_max_cash_and_holdings(store):
    t212_account(qty=1, cash=50)
    order = respx.post(f"{T212}/equity/orders/market").respond(json={"id": 1})
    async with httpx.AsyncClient() as c:
        for kw, text in [(dict(amount=0.5), "Minimaal"), (dict(amount=300), "Dagmaximum"),
                         (dict(amount=60), "vrij saldo"), (dict(side="verkopen", amount=200), "hooguit")]:
            with pytest.raises(trading.TradeError, match=text):
                await trading.place(store, c, req(request_id=text, **kw))
    assert not order.called
    assert [r["ok"] for r in store.orders_log()] == [0, 0, 0, 0]  # mislukte pogingen staan ook in het logboek


async def test_refuses_live_keys_and_missing_keys(store):
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": False})
    with pytest.raises(trading.TradeError, match="echt geld"):
        await trading.place(store, None, req())
    store.delete_secret("okx.handel")
    with pytest.raises(trading.TradeError, match="okx-handel"):
        await trading.place(store, None, req(pos_id="btc"))
    with pytest.raises(trading.TradeError, match="niet via de app"):
        await trading.place(store, None, req(pos_id="bank-0"))


@respx.mock
async def test_okx_market_buy_in_euros_and_limit_sell_in_btc(store):
    okx_market()
    order = respx.post(f"{OKX}/api/v5/trade/order").respond(json={"code": "0", "data": [{"ordId": "555", "sCode": "0"}]})
    async with httpx.AsyncClient() as c:
        await trading.place(store, c, req(pos_id="btc", amount=100, request_id="a-1"))
        await trading.place(store, c, req(pos_id="btc", side="verkopen", amount=90, type="limiet", limit_pct=-0.5, request_id="a-2"))
    buy, sell = (json.loads(call.request.content) for call in order.calls)
    assert buy == {"instId": "BTC-EUR", "tdMode": "cash", "side": "buy", "clOrdId": "a1", "ordType": "market",
                   "sz": "100.00", "tgtCcy": "quote_ccy"}
    assert sell["ordType"] == "limit" and sell["px"] == "89550" and sell["sz"] == "0.00100502"
    assert order.calls[0].request.headers["x-simulated-trading"] == "1"


@respx.mock
async def test_okx_sell_only_what_is_on_okx_not_trezor(store):
    okx_market(btc=0.01)  # € 900 op OKX; de rest van de € 9.000 staat op de Trezor
    store.set_setting("trade.daymax", 5000)
    async with httpx.AsyncClient() as c:
        with pytest.raises(trading.TradeError, match="alleen wat op OKX staat"):
            await trading.place(store, c, req(pos_id="btc", side="verkopen", amount=1000))
        q = await trading.quote(store, c, "btc")
    assert q["sellMax"] == 900 and q["cash"] == 1000 and q["pair"] == "BTC-EUR"


@respx.mock
async def test_okx_order_rejection_shows_reason(store):
    okx_market()
    respx.post(f"{OKX}/api/v5/trade/order").respond(json={"code": "1", "msg": "Operation failed",
                                                          "data": [{"sCode": "51008", "sMsg": "Insufficient balance"}]})
    async with httpx.AsyncClient() as c:
        with pytest.raises(trading.TradeError, match="Insufficient balance"):
            await trading.place(store, c, req(pos_id="btc", amount=100))


@respx.mock
async def test_open_orders_cancel_and_amend(store):
    respx.get(f"{T212}/equity/orders").respond(json=[
        {"id": 9, "ticker": "VWCEd_EQ", "type": "LIMIT", "quantity": 2, "filledQuantity": 0, "limitPrice": 120, "status": "NEW"}])
    respx.get(f"{OKX}/api/v5/trade/orders-pending").respond(json={"code": "0", "data": [
        {"ordId": "77", "instId": "BTC-EUR", "side": "sell", "ordType": "limit", "px": "95000", "sz": "0.001",
         "accFillSz": "0", "state": "live", "cTime": "1760000000000"}]})
    t212_del = respx.delete(f"{T212}/equity/orders/9").respond(200)
    t212_new = respx.post(f"{T212}/equity/orders/limit").respond(json={"id": 10})
    okx_amend = respx.post(f"{OKX}/api/v5/trade/amend-order").respond(json={"code": "0", "data": [{"sCode": "0"}]})
    okx_cancel = respx.post(f"{OKX}/api/v5/trade/cancel-order").respond(json={"code": "0", "data": [{"sCode": "0"}]})
    async with httpx.AsyncClient() as c:
        res = await trading.open_orders(store, c)
        assert [o["id"] for o in res["orders"]] == ["t212:9", "okx:BTC-EUR:77"]
        assert res["orders"][1]["side"] == "verkopen" and res["orders"][1]["limit"] == 95000
        assert (await trading.amend(store, c, "t212:9", 121.5))["id"] == "t212:10"
        await trading.amend(store, c, "okx:BTC-EUR:77", 96000)
        await trading.cancel(store, c, "okx:BTC-EUR:77")
    assert t212_del.called and json.loads(t212_new.calls[0].request.content)["limitPrice"] == 121.5
    assert json.loads(okx_amend.calls[0].request.content) == {"instId": "BTC-EUR", "ordId": "77", "newPx": "96000"}
    assert okx_cancel.called
    assert trading.used_today(store) == 0  # annuleren en wijzigen tellen niet mee voor het dagmaximum


def test_floor_and_round_to_step():
    assert trading.floor_to(0.0010059999, 0.00000001) == 0.00100599
    assert trading.floor_to(5.99, 1) == 5
    assert trading.round_to(89549.97, 0.1) == 89550.0


@respx.mock
def test_api_trade_endpoints(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    t212_account()
    respx.post(f"{T212}/equity/orders/market").respond(json={"id": 42})
    with TestClient(api.app) as c:
        assert c.post("/api/handel/order", json={}).status_code == 401
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        info = c.get("/api/handel", headers=h).json()
        assert info["connected"] == {"t212": True, "okx": True} and info["live"] is False
        q = c.get("/api/handel/positie/t212-VWCEd_EQ", headers=h).json()
        assert q["sellMax"] == 1280.4 and q["cash"] == 500 and q["demo"]
        r = c.post("/api/handel/order", headers=h, json={"posId": "t212-VWCEd_EQ", "side": "kopen", "amount": 50, "requestId": "x"})
        assert r.status_code == 200 and r.json()["ok"]
        r = c.post("/api/handel/order", headers=h, json={"posId": "t212-VWCEd_EQ", "side": "kopen", "amount": 0.2, "requestId": "y"})
        assert r.status_code == 400 and "Minimaal" in r.json()["detail"]
        assert c.post("/api/handel/order", headers=h, json={"posId": "x", "side": "stelen", "amount": 5, "requestId": "z"}).status_code == 422


@respx.mock
async def test_real_money_only_when_switched_on_with_its_own_low_day_max(store):
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": False})
    live = trading212.LIVE
    respx.get(f"{live}/equity/positions").respond(json=[{"instrument": {"ticker": "VWCEd_EQ"}, "quantity": 10}])
    respx.get(f"{live}/equity/account/summary").respond(json={"cash": {"availableToTrade": 500}})
    order = respx.post(f"{live}/equity/orders/market").respond(json={"id": 1})
    async with httpx.AsyncClient() as c:
        with pytest.raises(trading.TradeError, match="echtgeld aan"):
            await trading.place(store, c, req(amount=10, request_id="a"))
        store.set_setting("trade.live", True)
        await trading.place(store, c, req(amount=20, request_id="b"))
        with pytest.raises(trading.TradeError, match="nog voor € 5,00.*echtgeld maximum"):
            await trading.place(store, c, req(amount=10, request_id="c"))
        with pytest.raises(trading.TradeError, match="alleen marktorders"):
            await trading.place(store, c, req(amount=2, type="limiet", request_id="d"))
        q = await trading.quote(store, c, "t212-VWCEd_EQ")
    assert order.call_count == 1
    assert trading.used_today(store, demo=False) == 20 and trading.used_today(store) == 0  # apart geteld
    assert q["demo"] is False and q["dayMax"] == 25 and q["usedToday"] == 20 and q["limitAllowed"] is False



@respx.mock
async def test_t212_minimum_quantity_is_checked_before_sending(store):
    t212_account()
    trading212._meta[T212][1]["VWCEd_EQ"]["minTradeQuantity"] = 0.5
    order = respx.post(f"{T212}/equity/orders/market").respond(json={"id": 1})
    async with httpx.AsyncClient() as c:
        with pytest.raises(trading.TradeError, match="minimaal 0.5 stuks, ongeveer € 64,66"):
            await trading.place(store, c, req(amount=5))
        q = await trading.quote(store, c, "t212-VWCEd_EQ")
    assert not order.called and q["minQty"] == 0.5 and q["minAmount"] == 64.67


@respx.mock
async def test_t212_rejection_is_explained_in_dutch(store):
    t212_account()
    trading212._meta[T212][1]["VWCEd_EQ"]["minTradeQuantity"] = 0
    respx.post(f"{T212}/equity/orders/market").respond(400, json={"type": "/api-errors/min-quantity-exceeded"})
    async with httpx.AsyncClient() as c:
        with pytest.raises(trading.TradeError, match="kleiner dan het minimum"):
            await trading.place(store, c, req(amount=5))
