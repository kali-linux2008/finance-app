import json

import httpx
import respx

from meridian import config, notify


def test_topic_is_secret_and_stable(store):
    first = notify.topic(store)
    assert first.startswith("meridian-") and len(first) > 25
    assert notify.topic(store) == first
    assert notify.topic(store, new=True) != first


@respx.mock
async def test_send_to_own_ntfy_server(store):
    route = respx.post(config.NTFY_URL).respond(200, json={"id": "x"})
    async with httpx.AsyncClient() as c:
        assert await notify.send(store, c, "Inleg gelukt", "€ 375,00 belegd.")
    sent = json.loads(route.calls[0].request.content)
    assert sent == {"topic": notify.topic(store), "title": "Inleg gelukt", "message": "€ 375,00 belegd.", "tags": ["moneybag"]}


@respx.mock
async def test_send_never_raises(store):
    respx.post(config.NTFY_URL).mock(side_effect=httpx.ConnectError("weg"))
    async with httpx.AsyncClient() as c:
        assert not await notify.send(store, c, "x", "y")
    respx.post(config.NTFY_URL).respond(500)
    async with httpx.AsyncClient() as c:
        assert not await notify.send(store, c, "x", "y")
