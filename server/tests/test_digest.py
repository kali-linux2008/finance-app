from datetime import datetime

import httpx
import respx
from fastapi.testclient import TestClient

from meridian import alerts, api, auth, config, digest, notify
from meridian.sources import trading212

T212 = trading212.LIVE


def at(d, h=18, m=5):
    return datetime(2026, 11, d, h, m, tzinfo=config.TZ)


def test_weekly_summary(store):
    store.add_snapshot(60000, at(1, 12).timestamp())  # zondag ervoor
    store.add_snapshot(60500, at(4, 12).timestamp())
    store.add_snapshot(61200, at(8, 17).timestamp())
    assert digest.weekly(store, at(8, 17)) is None  # nog geen 18:00
    e = digest.weekly(store, at(8))
    assert e["title"] == "Weekoverzicht · week 45"
    assert e["body"] == "+€ 1.200 (+2,0%) deze week. Totaal € 61.200, FIRE-doel nu 12%."
    assert digest.weekly(store, at(8, 20)) is None  # één keer per week
    digest.set_types(store, {"week": False})
    assert digest.weekly(store, at(15)) is None


def test_weekly_without_data_sends_nothing(store):
    assert digest.weekly(store, at(8)) is None and notify.events(store) == []


def test_milestones_every_10_percent(store):
    store.add_snapshot(95000, at(2).timestamp())
    assert digest.milestone(store, at(2)) is None  # eerste keer alleen onthouden (10%)
    store.add_snapshot(101000, at(3).timestamp())
    e = digest.milestone(store, at(3))
    assert e["title"] == "Mijlpaal bereikt" and e["body"] == "Je hebt 20% van je FIRE-doel: € 101.000 van € 500.000."
    assert digest.milestone(store, at(3, 19)) is None
    store.add_snapshot(99000, at(4).timestamp())
    assert digest.milestone(store, at(4)) is None  # gedaald: niet opnieuw
    store.add_snapshot(102000, at(5).timestamp())
    assert digest.milestone(store, at(5))["body"].startswith("Je hebt 20%")  # na een daling mag hij weer


@respx.mock
async def test_dividends_only_new_ones(store):
    store.set_secret("t212", {"key": "K", "secret": "S"})
    route = respx.get(f"{T212}/history/dividends").respond(json={"items": [
        {"ticker": "VWCEd_EQ", "reference": "r1", "amount": 4.12, "amountInEuro": 4.12, "paidOn": "2026-10-01"}]})
    async with httpx.AsyncClient() as c:
        assert await digest.dividends(store, c, now=1000) == []  # eerste keer: onthouden
        assert await digest.dividends(store, c, now=2000) == []  # nog geen 6 uur verder
        route.respond(json={"items": [
            {"ticker": "LMT_US_EQ", "reference": "r2", "amount": 3.5, "amountInEuro": 3.01, "paidOn": "2026-11-01"},
            {"ticker": "VWCEd_EQ", "reference": "r1", "amount": 4.12, "amountInEuro": 4.12, "paidOn": "2026-10-01"}]})
        sent = await digest.dividends(store, c, now=1000 + 7 * 3600)
    assert [e["body"] for e in sent] == ["€ 3,01 van LMT op Trading 212."]
    assert route.call_count == 2


@respx.mock
async def test_dividends_without_permission_is_quiet(store):
    store.set_secret("t212", {"key": "K", "secret": "S"})
    respx.get(f"{T212}/history/dividends").respond(403)
    async with httpx.AsyncClient() as c:
        assert await digest.dividends(store, c, now=1000) == []


async def test_price_alerts_can_be_switched_off(store, monkeypatch):
    async def quotes(s, c, keys):
        return {"okx:BTC": {"price": 1.0}}
    store.set_setting("alerts", [{"id": "a", "key": "okx:BTC", "tk": "BTC", "name": "Bitcoin", "cur": "EUR",
                                  "dir": "onder", "price": 2.0, "repeat": False}])
    monkeypatch.setattr(alerts, "quotes", quotes)
    digest.set_types(store, {"price": False})
    assert await alerts.check(store, None) == [] and len(alerts.get_alerts(store)) == 1
    digest.set_types(store, {"price": True})
    assert len(await alerts.check(store, None)) == 1


def test_api_settings(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = c.get("/api/meldingen/instellingen", headers=h).json()
        assert r["types"] == {"price": True, "div": True, "goal": True, "week": True, "order": True} and r["goal"] == 500000
        r = c.put("/api/meldingen/instellingen", headers=h, json={"types": {"week": False, "onzin": False}, "goal": 750000}).json()
        assert r["types"]["week"] is False and "onzin" not in r["types"] and r["goal"] == 750000
        assert c.put("/api/meldingen/instellingen", headers=h, json={"goal": 5}).status_code == 400
