import json

from fastapi.testclient import TestClient

from meridian import api, appupdate, auth, config, notify


def build(tmp_path, code, built=1761400000):
    (tmp_path / "meridian.apk").write_bytes(b"PK" + bytes(100))
    (tmp_path / "versie.json").write_text(json.dumps({"versionCode": code, "version": "0.1.0", "built": built}))


def test_info_needs_both_files(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "APP_DIR", tmp_path)
    assert appupdate.info() is None
    (tmp_path / "versie.json").write_text('{"versionCode": 5}')
    assert appupdate.info() is None  # nog geen APK
    (tmp_path / "meridian.apk").write_bytes(b"x")
    assert appupdate.info()["versionCode"] == 5
    (tmp_path / "versie.json").write_text("half geschreven")
    assert appupdate.info() is None


def test_announce_new_builds_once(tmp_path, monkeypatch, store):
    monkeypatch.setattr(config, "APP_DIR", tmp_path)
    build(tmp_path, 100)
    assert not appupdate.announce(store)  # eerste build: die heb je zelf geïnstalleerd
    assert not appupdate.announce(store)
    build(tmp_path, 101)
    assert appupdate.announce(store)
    assert not appupdate.announce(store)
    ev = notify.events(store)
    assert len(ev) == 1 and ev[0]["title"] == "Nieuwe app-versie" and "Updaten" in ev[0]["body"]


def test_api_app(tmp_path, monkeypatch, store):
    monkeypatch.setattr(config, "APP_DIR", tmp_path)
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        assert c.get("/api/app").status_code == 401
        assert c.get("/api/app/apk").status_code == 401
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        assert c.get("/api/app", headers=h).json() == {"available": None}
        assert c.get("/api/app/apk", headers=h).status_code == 404
        build(tmp_path, 7)
        assert c.get("/api/app", headers=h).json()["available"]["versionCode"] == 7
        r = c.get("/api/app/apk", headers=h)
        assert r.status_code == 200 and r.content.startswith(b"PK")
        assert r.headers["content-type"] == "application/vnd.android.package-archive"
