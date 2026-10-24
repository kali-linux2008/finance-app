import json

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from meridian import api, auth, notify

TOKEN_A = "ExponentPushToken[aaaa]"
TOKEN_B = "ExponentPushToken[bbbb]"


def test_add_and_remove_tokens(store):
    notify.add_token(store, TOKEN_A, "Pixel 8")
    notify.add_token(store, TOKEN_A, "Pixel 8")  # niet dubbel
    assert [t["device"] for t in notify.tokens(store)] == ["Pixel 8"]
    with pytest.raises(ValueError):
        notify.add_token(store, "iets anders", "x")
    notify.remove_token(store, TOKEN_A)
    assert notify.tokens(store) == []


@respx.mock
async def test_send_to_all_phones_and_forget_removed_ones(store):
    notify.add_token(store, TOKEN_A, "Pixel")
    notify.add_token(store, TOKEN_B, "Oude telefoon")
    route = respx.post(notify.PUSH_URL).respond(json={"data": [
        {"status": "ok", "id": "1"},
        {"status": "error", "message": "not registered", "details": {"error": "DeviceNotRegistered"}}]})
    async with httpx.AsyncClient() as c:
        assert await notify.send(store, c, "Inleg gelukt", "€ 375,00 belegd.") == 1
    sent = json.loads(route.calls[0].request.content)
    assert sent[0] == {"to": TOKEN_A, "title": "Inleg gelukt", "body": "€ 375,00 belegd.", "sound": "default",
                       "channelId": "default", "data": {}}
    assert [t["token"] for t in notify.tokens(store)] == [TOKEN_A]


@respx.mock
async def test_send_never_raises(store):
    notify.add_token(store, TOKEN_A, "Pixel")
    respx.post(notify.PUSH_URL).mock(side_effect=httpx.ConnectError("weg"))
    async with httpx.AsyncClient() as c:
        assert await notify.send(store, c, "x", "y") == 0
    async with httpx.AsyncClient() as c:
        notify.remove_token(store, TOKEN_A)
        assert await notify.send(store, c, "x", "y") == 0  # geen telefoons: niets versturen


def test_api_push(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        assert c.post("/api/push", json={"token": TOKEN_A}).status_code == 401
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        assert c.post("/api/push", headers=h, json={"token": TOKEN_A, "device": "Pixel 8"}).json()["ok"]
        assert c.post("/api/push", headers=h, json={"token": "nep"}).status_code == 400
        assert notify.tokens(store)[0]["device"] == "Pixel 8"
        c.post("/api/push/uit", headers=h, json={"token": TOKEN_A})
        assert notify.tokens(store) == []
