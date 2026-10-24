import json
import time
from datetime import date, datetime

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from meridian import api, auth, config, plans, portfolio, trading
from meridian.sources import trading212

T212 = trading212.DEMO
POSITIONS = [
    {"id": "t212-VWCEd_EQ", "tk": "VWCE", "name": "Vanguard FTSE All-World", "cat": "eq", "value": 1680, "qty": 10, "price": 168.0, "cur": "EUR"},
    {"id": "t212-LMT_US_EQ", "tk": "LMT", "name": "Lockheed Martin", "cat": "eq", "value": 160, "qty": 0.3, "price": 620.0, "cur": "USD"},
    {"id": "btc", "tk": "BTC", "name": "Bitcoin", "cat": "cr", "value": 1300, "qty": 0.015, "price": 90000, "cur": "EUR"},
]
PLAN = {"active": True, "day": 25, "lines": [{"posId": "t212-VWCEd_EQ", "amount": 250}, {"posId": "t212-LMT_US_EQ", "amount": 37.5}]}


@pytest.fixture(autouse=True)
def setup(monkeypatch, store):
    async def build(s, c, force=False):
        return {"positions": POSITIONS}
    monkeypatch.setattr(portfolio, "build", build)
    trading._accounts.clear()
    meta = {p["id"][5:]: {"minTradeQuantity": 0.001} for p in POSITIONS if p["id"].startswith("t212-")}
    trading212._meta[T212] = (time.time(), meta)
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": True})


def at(y, m, d, hh=16, mm=0):
    return datetime(y, m, d, hh, mm, tzinfo=config.TZ)


def account(cash):
    respx.get(f"{T212}/equity/positions").respond(json=[])
    respx.get(f"{T212}/equity/account/summary").respond(json={"cash": {"availableToTrade": cash}})


async def no_sleep(_):
    pass


def test_due_date_moves_weekend_to_monday():
    assert plans.due_date(25, 2026, 10) == date(2026, 10, 26)  # 25 okt 2026 is een zondag
    assert plans.due_date(31, 2026, 2) == date(2026, 2, 27)  # hooguit de 28e; za 28 feb → vr 27 feb (niet naar maart)
    assert plans.due_date(15, 2026, 10) == date(2026, 10, 15)


def test_runs_only_when_switched_on_on_the_day_in_market_hours(store):
    store.set_setting("plan", PLAN)
    assert not plans.is_due(store, at(2026, 10, 26))  # nog niet aangezet op de server
    store.set_setting("plan.enabled", True)
    assert plans.is_due(store, at(2026, 10, 26))
    assert not plans.is_due(store, at(2026, 10, 23))  # te vroeg in de maand
    assert not plans.is_due(store, at(2026, 10, 26, 10, 0))  # beurzen nog niet allebei open
    assert not plans.is_due(store, at(2026, 10, 31))  # zaterdag
    assert plans.is_due(store, at(2026, 10, 27))  # gemist: volgende werkdag alsnog
    store.set_setting("plan.done", "2026-10")
    assert not plans.is_due(store, at(2026, 10, 27))
    store.set_setting("plan", {**PLAN, "active": False})
    store.set_setting("plan.done", None)
    assert not plans.is_due(store, at(2026, 10, 26))


@respx.mock
async def test_run_buys_every_line_once_per_month(store):
    store.set_setting("plan", PLAN)
    account(500)
    order = respx.post(f"{T212}/equity/orders/market").respond(json={"id": 1})
    async with httpx.AsyncClient() as c:
        rep = await plans.run(store, c, at(2026, 10, 26), sleep=no_sleep)
        store.set_setting("plan.tried", None)
        again = await plans.run(store, c, at(2026, 10, 26), sleep=no_sleep)
    assert rep["ok"] and rep["message"] == "Alles gekocht." and order.call_count == 2  # niet nog eens
    assert again["ok"]
    assert json.loads(order.calls[0].request.content)["ticker"] == "VWCEd_EQ"
    assert store.get_setting("plan.done") == "2026-10"
    assert trading.used_today(store) == 0  # telt niet mee voor het dagmaximum
    assert [r["action"] for r in store.orders_log()] == ["periodiek", "periodiek"]


@respx.mock
async def test_run_buys_nothing_when_cash_is_short(store):
    store.set_setting("plan", PLAN)
    store.set_setting("plan.enabled", True)
    account(100)
    order = respx.post(f"{T212}/equity/orders/market").respond(json={"id": 1})
    async with httpx.AsyncClient() as c:
        rep = await plans.run(store, c, at(2026, 10, 26), sleep=no_sleep)
    assert not order.called and not rep["ok"] and "€ 100,00 vrij" in rep["message"]
    assert store.get_setting("plan.done") is None
    assert not plans.is_due(store, at(2026, 10, 26, 16, 30))  # vandaag niet nog eens
    assert plans.is_due(store, at(2026, 10, 27))  # morgen opnieuw
    assert store.get_setting("plan.runs")[0]["message"] == rep["message"]


def test_validate_month_max_and_lines(store):
    with pytest.raises(trading.TradeError, match="maandmaximum"):
        plans.validate(store, {"active": True, "day": 25, "lines": [{"posId": "a", "amount": 500}]})
    with pytest.raises(trading.TradeError, match="één keer"):
        plans.validate(store, {"active": True, "day": 25, "lines": [{"posId": "a", "amount": 5}, {"posId": "a", "amount": 5}]})
    with pytest.raises(trading.TradeError, match="dag"):
        plans.validate(store, {"active": True, "day": 31, "lines": []})
    store.set_setting("plan.monthmax", 1000)
    assert plans.total(plans.validate(store, {"active": True, "day": 25, "lines": [{"posId": "a", "amount": 500}]})) == 500


def test_next_run(store):
    store.set_setting("plan", PLAN)
    assert plans.next_run(store, at(2026, 10, 24)) == at(2026, 10, 26, 15, 45).timestamp()
    store.set_setting("plan.done", "2026-10")
    assert plans.next_run(store, at(2026, 10, 27)) == at(2026, 11, 25, 15, 45).timestamp()


def test_api_plan(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        assert c.get("/api/plan", headers=h).json()["plan"]["lines"] == []
        r = c.put("/api/plan", headers=h, json=PLAN)
        assert r.status_code == 200 and r.json()["total"] == 287.5 and r.json()["enabled"] is False
        assert r.json()["plan"]["lines"][1]["tk"] == "LMT"
        r = c.put("/api/plan", headers=h, json={**PLAN, "lines": [{"posId": "btc", "amount": 10}]})
        assert r.status_code == 400 and "Trading 212" in r.json()["detail"]
