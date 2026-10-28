import time

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from meridian import api, auth, config, net, notify, prices


@respx.mock
async def test_get_is_retried_once_post_never():
    route = respx.get("https://x.test/a").mock(side_effect=[httpx.ConnectError("weg"), httpx.Response(200, json={"ok": 1})])
    post = respx.post("https://x.test/order").mock(side_effect=httpx.ConnectError("weg"))
    async with httpx.AsyncClient() as c:
        assert (await net.request(c, "GET", "https://x.test/a")).json() == {"ok": 1}
        with pytest.raises(httpx.ConnectError):
            await net.request(c, "POST", "https://x.test/order")
    assert route.call_count == 2 and post.call_count == 1  # een order nooit dubbel


@respx.mock
async def test_stale_price_when_okx_is_down():
    url = f"{config.OKX_URL}/api/v5/market/ticker"
    respx.get(url).respond(json={"code": "0", "data": [{"last": "90000", "sodUtc0": "88000"}]})
    async with httpx.AsyncClient() as c:
        assert (await prices.ticker(c, "BTC-EUR"))[0] == 90000
        prices._cache["BTC-EUR"] = (time.time() - 120, 90000.0, 88000.0)  # niet meer vers
        respx.get(url).mock(side_effect=httpx.ConnectError("weg"))
        assert (await prices.ticker(c, "BTC-EUR"))[0] == 90000  # oude koers als terugval
        prices._cache["BTC-EUR"] = (time.time() - 3600, 90000.0, 88000.0)  # te oud
        with pytest.raises(prices.PriceError):
            await prices.ticker(c, "BTC-EUR")


def test_token_last_seen_not_written_every_request(store, monkeypatch):
    token = auth.redeem_pair_code(store, auth.new_pair_code(store), "telefoon")
    assert auth.check_token(store, token) and not auth.check_token(store, "fout")
    first = store._one("SELECT last_seen FROM devices")[0]
    monkeypatch.setattr(auth.time, "time", lambda: first + 60)
    assert auth.check_token(store, token)
    assert store._one("SELECT last_seen FROM devices")[0] == first  # binnen 5 min niet opnieuw
    monkeypatch.setattr(auth.time, "time", lambda: first + 400)
    auth.check_token(store, token)
    assert store._one("SELECT last_seen FROM devices")[0] == first + 400


def test_same_notification_not_twice(store, monkeypatch):
    a = notify.add(store, "Inleg morgen", "Te weinig saldo")
    b = notify.add(store, "Inleg morgen", "Te weinig saldo")
    assert a["id"] == b["id"] and len(notify.events(store)) == 1
    notify.add(store, "Inleg morgen", "Iets anders")
    later = time.time() + notify.DEDUPE + 1
    monkeypatch.setattr(notify.time, "time", lambda: later)
    notify.add(store, "Inleg morgen", "Te weinig saldo")
    assert len(notify.events(store)) == 3


def test_prune_old(store):
    store.add_bank_tx([{"iban": "NL1", "seq": 1, "date": "2020-01-01", "amount": 1.0},
                       {"iban": "NL1", "seq": 2, "date": "2026-01-01", "amount": 1.0}])
    store.log_order(broker="t212", demo=1, action="kopen", symbol="X", ok=1, ts=1000.0)
    store.log_order(broker="t212", demo=1, action="kopen", symbol="Y", ok=1)
    assert store.prune_old("2023-10-28", time.time() - 86400) == 2
    assert [t["seq"] for t in store.bank_tx()] == [2] and [o["symbol"] for o in store.orders_log()] == ["Y"]
    store.optimize()


def test_health_headers_and_size_limit(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        r = c.get("/api/health")
        body = r.json()
        assert body["ok"] and body["db"] and set(body["tasks"]) >= {"periodiek", "onderhoud", "koersalerts"}
        assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff"
        big = c.post("/api/bank/csv", content=b"x" * 10, headers={"content-length": str(api.MAX_BODY + 1), "content-type": "application/json"})
        assert big.status_code == 413
