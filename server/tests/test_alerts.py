import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from meridian import alerts, api, auth, config, notify, portfolio, prices

POSITIONS = [
    {"id": "t212-RHMd_EQ", "tk": "RHM", "name": "Rheinmetall", "cat": "eq", "value": 300, "qty": 0.2, "price": 1500.0, "cur": "EUR", "dayChange": 1.2},
    {"id": "t212-LMT_US_EQ", "tk": "LMT", "name": "Lockheed Martin", "cat": "eq", "value": 160, "qty": 0.3, "price": 620.0, "cur": "USD"},
    {"id": "btc", "tk": "BTC", "name": "Bitcoin", "cat": "cr", "value": 1300, "qty": 0.015, "price": 90000, "cur": "EUR"},
    {"id": "ing", "tk": "ING", "name": "Betaalrekening", "cat": "cash", "value": 500},
]
PRICE = {"BTC": 90000.0, "XRP": 2.1}


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    async def build(s, c, force=False):
        return {"positions": POSITIONS}

    async def eur_price(c, ccy):
        if ccy not in PRICE:
            raise prices.PriceError("geen koers")
        return PRICE[ccy], 0.5

    monkeypatch.setattr(portfolio, "build", build)
    monkeypatch.setattr(prices, "eur_price", eur_price)
    alerts._spark.clear()
    alerts._coins = (0.0, [])


def test_keys_and_format():
    assert alerts.key_for(POSITIONS[0]) == "t212-RHMd_EQ"
    assert alerts.key_for(POSITIONS[2]) == "okx:BTC"  # crypto altijd via OKX, ook als je hem hebt
    assert alerts.fmt(1650) == "€ 1.650,00"
    assert alerts.fmt(0.5123, "USD") == "$ 0,5123"


async def test_quotes_own_stocks_and_any_crypto(store):
    q = await alerts.quotes(store, None, ["t212-RHMd_EQ", "t212-LMT_US_EQ", "okx:XRP", "okx:NOPE", "ing", "weg"])
    assert set(q) == {"t212-RHMd_EQ", "t212-LMT_US_EQ", "okx:XRP"}
    assert q["t212-LMT_US_EQ"]["cur"] == "USD" and q["okx:XRP"]["name"] == "XRP" and q["okx:XRP"]["price"] == 2.1


async def test_add_alert_validates(store):
    with pytest.raises(alerts.AlertError, match="al boven"):
        await alerts.add_alert(store, None, {"key": "t212-RHMd_EQ", "dir": "boven", "price": 1400})
    with pytest.raises(alerts.AlertError, match="Geen koers"):
        await alerts.add_alert(store, None, {"key": "okx:NOPE", "dir": "boven", "price": 1})
    with pytest.raises(alerts.AlertError, match="boven nul"):
        await alerts.add_alert(store, None, {"key": "okx:BTC", "dir": "onder", "price": 0})
    a = await alerts.add_alert(store, None, {"key": "t212-RHMd_EQ", "dir": "boven", "price": 1600})
    assert a["tk"] == "RHM" and a["armed"] and not a["repeat"]
    assert alerts.remove_alert(store, a["id"]) and alerts.get_alerts(store) == []


async def test_one_time_alert_fires_once_and_is_removed(store, monkeypatch):
    await alerts.add_alert(store, None, {"key": "okx:BTC", "dir": "onder", "price": 85000})
    assert await alerts.check(store, None) == []
    monkeypatch.setitem(PRICE, "BTC", 84000.0)
    fired = await alerts.check(store, None)
    assert [a["tk"] for a in fired] == ["BTC"] and alerts.get_alerts(store) == []
    ev = notify.events(store)[-1]
    assert ev["title"] == "Koersalert · BTC"
    assert ev["body"] == "Bitcoin staat op € 84.000,00, onder je alert van € 85.000,00. De alert staat nu uit."


async def test_repeating_alert_waits_until_price_was_back(store, monkeypatch):
    await alerts.add_alert(store, None, {"key": "okx:XRP", "dir": "boven", "price": 2.2, "repeat": True})
    monkeypatch.setitem(PRICE, "XRP", 2.25)
    assert len(await alerts.check(store, None)) == 1
    assert await alerts.check(store, None) == []  # niet elke 2 minuten opnieuw
    monkeypatch.setitem(PRICE, "XRP", 2.19)  # nog geen 1% terug
    assert await alerts.check(store, None) == []
    monkeypatch.setitem(PRICE, "XRP", 2.1)
    assert await alerts.check(store, None) == []  # nu weer scherp
    monkeypatch.setitem(PRICE, "XRP", 2.3)
    assert len(await alerts.check(store, None)) == 1
    assert len(alerts.get_alerts(store)) == 1 and len(notify.events(store)) == 2


async def test_check_keeps_alerts_added_meanwhile(store, monkeypatch):
    await alerts.add_alert(store, None, {"key": "okx:BTC", "dir": "onder", "price": 85000})
    real = alerts.quotes

    async def slow_quotes(s, c, keys):
        store.set_setting("alerts", alerts.get_alerts(store) + [{"id": "nieuw", "key": "okx:XRP", "tk": "XRP", "name": "XRP",
                                                                 "cur": "EUR", "dir": "boven", "price": 9, "repeat": False}])
        return await real(s, c, keys)

    monkeypatch.setattr(alerts, "quotes", slow_quotes)
    monkeypatch.setitem(PRICE, "BTC", 80000.0)
    await alerts.check(store, None)
    assert [a["id"] for a in alerts.get_alerts(store)] == ["nieuw"]


@respx.mock
async def test_watchlist_and_search(store):
    respx.get(f"{config.OKX_URL}/api/v5/public/instruments").respond(json={"data": [
        {"baseCcy": "XRP", "quoteCcy": "EUR"}, {"baseCcy": "XRP", "quoteCcy": "USDT"},
        {"baseCcy": "XLM", "quoteCcy": "USDT"}, {"baseCcy": "BTC", "quoteCcy": "EUR"}, {"baseCcy": "OLD", "quoteCcy": "BTC"}]})
    respx.get(f"{config.OKX_URL}/api/v5/market/ticker").respond(json={"code": "0", "data": [{"last": "2.1", "sodUtc0": "2.0"}]})
    respx.get(f"{config.OKX_URL}/api/v5/market/candles").respond(json={"data": [["1", "1", "1", "1", "2.0", "5"], ["0", "1", "1", "1", "1.9", "5"]]})
    async with httpx.AsyncClient() as c:
        res = await alerts.search(store, c, "x")
        assert [r["tk"] for r in res] == ["XLM", "XRP"]
        res = await alerts.search(store, c, "bitc")
        assert res[0] == {"key": "okx:BTC", "tk": "BTC", "name": "Bitcoin", "cat": "cr", "own": True}
        assert [r["key"] for r in await alerts.search(store, c, "rhein")] == ["t212-RHMd_EQ"]
        assert await alerts.search(store, c, "ing") == []  # geen rekeningen

        await alerts.add_watch(store, c, "okx:XRP")
        await alerts.add_watch(store, c, "okx:XRP")
        await alerts.add_watch(store, c, "t212-RHMd_EQ")
        with pytest.raises(alerts.AlertError):
            await alerts.add_watch(store, c, "okx:NOPE")
        st = await alerts.watch_state(store, c)
    xrp, rhm = st["items"]
    assert xrp["price"] == 2.1 and xrp["spark"] == [1.9, 2.0] and rhm["spark"] is None and rhm["chg"] == 1.2
    assert [i["key"] for i in alerts.remove_watch(store, "okx:XRP")] == ["t212-RHMd_EQ"]


def test_api(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        assert c.get("/api/alerts").status_code == 401
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        q = c.get("/api/koers?key=t212-RHMd_EQ", headers=h).json()
        assert q["price"] == 1500 and q["alerts"] == []
        assert c.get("/api/koers?key=okx:NOPE", headers=h).status_code == 404
        r = c.post("/api/alerts", headers=h, json={"key": "t212-RHMd_EQ", "dir": "boven", "price": 1575, "repeat": True})
        assert r.status_code == 200 and r.json()["alert"]["repeat"] is True
        r = c.post("/api/alerts", headers=h, json={"key": "t212-RHMd_EQ", "dir": "onder", "price": 1600})
        assert r.status_code == 400 and "al onder" in r.json()["detail"]
        aid = c.get("/api/alerts", headers=h).json()["alerts"][0]["id"]
        assert c.get("/api/koers?key=t212-RHMd_EQ", headers=h).json()["alerts"][0]["id"] == aid
        assert c.post("/api/alerts/verwijder", headers=h, json={"id": aid}).json()["alerts"] == []
        r = c.post("/api/volglijst", headers=h, json={"key": "okx:BTC"})
        assert r.status_code == 200 and r.json()["items"][0]["tk"] == "BTC"
        assert c.post("/api/volglijst/verwijder", headers=h, json={"key": "okx:BTC"}).json()["items"] == []
