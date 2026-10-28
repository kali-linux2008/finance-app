import pytest
from fastapi.testclient import TestClient

from meridian import api, auth, portfolio, rebalance, trading

POS = [
    {"id": "t212-VWCEd_EQ", "tk": "VWCE", "name": "Vanguard FTSE All-World", "cat": "eq", "value": 6000, "qty": 50, "price": 120.0, "cur": "EUR"},
    {"id": "t212-RHMd_EQ", "tk": "RHM", "name": "Rheinmetall", "cat": "eq", "value": 2000, "qty": 1.2, "price": 1650.0, "cur": "EUR"},
    {"id": "btc", "tk": "BTC", "name": "Bitcoin", "cat": "cr", "value": 1500, "qty": 0.016, "price": 90000, "cur": "EUR",
     "wallets": [{"name": "Trezor Safe 5", "value": 1000}, {"name": "OKX", "value": 500}]},
    {"id": "rabo-1", "tk": "RABO", "name": "Betaalrekening", "cat": "cash", "value": 500},
]
TARGETS = {"eq": 70, "cr": 20, "cash": 10, "gold": 0}


def test_validate():
    assert rebalance.validate({"eq": 70, "cr": 20, "cash": "10"}) == TARGETS
    for bad, msg in [({"eq": 72, "cr": 28}, "stappen"), ({"eq": 70, "cr": 20}, "100%"), ({"xx": 100}, "Onbekende")]:
        with pytest.raises(rebalance.RebalanceError, match=msg):
            rebalance.validate(bad)


def test_analyse_and_buy_only():
    rows = {r["cls"]: r for r in rebalance.analyse(POS, TARGETS)}  # totaal 10.000
    assert rows["eq"]["pct"] == 80.0 and rows["eq"]["diff"] == -1000
    assert rows["cr"]["diff"] == 500 and rows["cash"]["diff"] == 500 and rows["gold"]["diff"] == 0
    buy = {b["cls"]: b["amount"] for b in rebalance.buy_only(list(rows.values()), 400)}
    assert buy == {"cr": 200.0, "cash": 200.0}  # alleen wat achterloopt, naar verhouding
    buy = {b["cls"]: b["amount"] for b in rebalance.buy_only(list(rows.values()), 1500)}
    assert buy == {"eq": 350.0, "cr": 600.0, "cash": 550.0}  # eerst de tekorten, de rest volgens het doel
    assert rebalance.buy_only(list(rows.values()), 0) == []


def test_proposals_sell_first_and_respect_trezor():
    rows = rebalance.analyse(POS, TARGETS)
    prop = rebalance.proposals(POS, rows)
    orders = [(o["side"], o["tk"], o["amount"], o["broker"]) for o in prop["orders"]]
    assert orders == [("verkopen", "VWCE", 750.0, "t212"), ("verkopen", "RHM", 250.0, "t212"), ("kopen", "BTC", 500.0, "okx")]
    assert prop["manual"] == [{"cls": "cash", "amount": 500.0, "text": "Geld erbij: € 500,00"}]
    # BTC te veel, maar alleen het OKX-deel (€ 500) mag verkocht worden
    rows = rebalance.analyse(POS, {"eq": 85, "cr": 5, "cash": 10, "gold": 0})
    sells = [o for o in rebalance.proposals(POS, rows)["orders"] if o["tk"] == "BTC"]
    assert sells == [{**sells[0], "side": "verkopen", "amount": 500.0}]


def test_close_to_target_does_nothing():
    rows = rebalance.analyse(POS, {"eq": 80, "cr": 15, "cash": 5, "gold": 0})
    assert rebalance.proposals(POS, rows) == {"orders": [], "manual": []}


async def test_execute_uses_normal_orders(store, monkeypatch):
    placed = []

    async def place(s, c, req, plan=False):
        placed.append(req)
        if req.pos_id == "kapot":
            raise trading.TradeError("Dagmaximum bereikt")
        return {"ok": True, "message": None}

    monkeypatch.setattr(trading, "place", place)
    res = await rebalance.execute(store, None, [{"posId": "btc", "side": "kopen", "amount": 50}, {"posId": "kapot", "side": "kopen", "amount": 10}], "abc")
    assert [r["ok"] for r in res] == [True, False] and res[1]["message"] == "Dagmaximum bereikt"
    assert [r.request_id for r in placed] == ["rb-abc-0", "rb-abc-1"] and placed[0].type == "markt"
    with pytest.raises(rebalance.RebalanceError):
        await rebalance.execute(store, None, [], "abc")


def test_api(store, monkeypatch):
    async def build(s, c, force=False):
        return {"positions": POS}
    monkeypatch.setattr(portfolio, "build", build)
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = c.get("/api/herbalanceren", headers=h).json()
        assert r["targets"] is None and r["current"]["eq"] == 8000
        assert c.put("/api/herbalanceren", headers=h, json={"targets": {"eq": 33}}).status_code == 400
        assert c.put("/api/herbalanceren", headers=h, json={"targets": TARGETS}).json()["targets"] == TARGETS
        r = c.get("/api/herbalanceren?bedrag=400", headers=h).json()
        assert r["amount"] == 400 and len(r["buyOnly"]) == 2 and len(r["proposals"]["orders"]) == 3
