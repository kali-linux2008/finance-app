import time

import pytest
from fastapi.testclient import TestClient

from meridian import api, auth, portfolio
from meridian.models import Position, SourceResult


def pos(**kw):
    base = dict(id="x", tk="X", name="X", cls="Crypto", cat="cr", src="OKX", value=100.0, tile=2, qty=1, unit="X", price=100.0, cur="EUR")
    return Position(**{**base, **kw})


@pytest.fixture
def fake_sources(monkeypatch, store):
    async def t212(client, secret):
        return SourceResult(id="t212", name="Trading 212", positions=[pos(id="t212-VWCE", tk="VWCE", cls="ETF", cat="eq", src="Trading 212", value=18220, cost=14950, tile=1)])

    async def okx_(client, secret):
        return SourceResult(id="okx", name="OKX", positions=[pos(id="okx-BTC", tk="BTC", name="Bitcoin", value=3461, qty=0.0377, unit="BTC")])

    async def trezor_(client, secret):
        return SourceResult(id="trezor", name="Trezor Safe 5", positions=[pos(id="trezor-BTC", tk="BTC", name="Bitcoin", src="Trezor Safe 5", value=9870, qty=0.1075, unit="BTC")])

    async def broken(client, secret):
        raise RuntimeError("OKX: Invalid Sign")

    monkeypatch.setattr(portfolio, "FETCHERS", {"t212": t212, "okx": okx_, "trezor": trezor_})
    for sid in ("t212", "okx", "trezor"):
        store.set_secret(sid, {"k": 1})
    store.set_setting("manual", {"banks": [{"name": "Rabobank Spaarrekening", "bank": "Rabobank", "kind": "spaar", "value": 12400, "rate": "1,5% rente"}],
                                 "pension": {"name": "ABP", "value": 14300}, "home": {"woz": 285000, "mortgage": 262400}})
    return broken


async def test_build_merges_btc_and_adds_manual(store, fake_sources):
    p = await portfolio.build(store, client=None)
    btc = next(x for x in p["positions"] if x["tk"] == "BTC")
    assert btc["value"] == 9870 + 3461 and len(btc["wallets"]) == 2
    assert btc["wallets"][0]["icon"] == "lock" and btc["src"] == "Trezor Safe 5 · OKX"
    assert p["total"] == 18220 + 9870 + 3461 + 12400
    assert [s["name"] for s in p["sources"]] == ["Trading 212", "Rabobank", "Trezor Safe 5", "OKX"]
    assert p["outside"]["equity"] == 22600 and p["outside"]["pensionName"] == "ABP"
    assert p["invested"] == 18220 and p["cost"] == 14950
    assert store.snapshots(0)  # verloop wordt bijgehouden


async def test_one_broken_source_does_not_block_others(store, fake_sources, monkeypatch):
    monkeypatch.setitem(portfolio.FETCHERS, "okx", fake_sources)
    p = await portfolio.build(store, client=None)
    okx = next(s for s in p["sources"] if s["id"] == "okx")
    assert okx["status"] == "fout" and "Invalid Sign" in okx["error"]
    assert p["total"] == 18220 + 9870 + 12400
    assert not store.snapshots(0)  # geen onvolledig totaal in de grafiek


async def test_day_change_from_snapshot_before_midnight(store, fake_sources):
    store.add_snapshot(40000, ts=portfolio.start_of_day(time.time()) - 3600)
    p = await portfolio.build(store, client=None)
    assert p["dayChange"] == pytest.approx(p["total"] - 40000)


def test_api_requires_pairing(store, fake_sources, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        assert c.get("/api/health").json()["ok"]
        assert c.get("/api/portfolio").status_code == 401
        assert c.post("/api/koppel", json={"code": "999999"}).status_code == 403
        code = auth.new_pair_code(store)
        token = c.post("/api/koppel", json={"code": code, "device": "Pixel 8"}).json()["token"]
        r = c.get("/api/portfolio", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200 and r.json()["total"] > 0
        h = c.get("/api/history?period=1D", headers={"Authorization": f"Bearer {token}"}).json()
        assert len(h["points"]) == 1
        assert c.get("/api/history?period=5J", headers={"Authorization": f"Bearer {token}"}).status_code == 422


async def test_failed_source_shows_last_known_value_even_after_restart(store, fake_sources, monkeypatch):
    await portfolio.build(store, client=None)  # alles lukt: laatste standen bewaard
    portfolio._cache.clear()  # alsof de server herstart

    async def slow(client, secret):
        raise RuntimeError("Blockchain-dienst reageert te traag")

    monkeypatch.setitem(portfolio.FETCHERS, "trezor", slow)
    p = await portfolio.build(store, client=None)
    tz = next(s for s in p["sources"] if s["id"] == "trezor")
    assert tz["status"] == "oud" and tz["value"] == 9870 and "traag" in tz["error"]
    btc = next(x for x in p["positions"] if x["tk"] == "BTC")
    assert btc["value"] == 9870 + 3461
