from fastapi.testclient import TestClient

from meridian import api, auth, notify


async def test_events_are_kept_for_the_app(store):
    await notify.send(store, None, "Inleg gelukt", "€ 375,00 belegd.", "ok")
    notify.add(store, "Test", "x")
    assert [e["id"] for e in notify.events(store)] == [1, 2]
    assert [e["title"] for e in notify.events(store, after=1)] == ["Test"]
    for i in range(60):
        notify.add(store, "x", str(i))
    assert len(notify.events(store)) == notify.KEEP and notify.events(store)[-1]["id"] == 62


def test_api_events(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    notify.add(store, "Inleg gelukt", "€ 375,00 belegd.", "ok")
    with TestClient(api.app) as c:
        assert c.get("/api/meldingen").status_code == 401
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        assert c.get("/api/meldingen", headers=h).json()["events"][0]["kind"] == "ok"
        assert c.get("/api/meldingen?na=1", headers=h).json()["events"] == []
