"""Pushmeldingen naar je telefoon via de push-dienst van Expo (exp.host).

De telefoon geeft de server zijn adres (een Expo push-token). De melding gaat dan
server → Expo → Google (FCM) → telefoon. Er gaat alleen een korte tekst mee, geen sleutels.
"""

import logging
import re
import time

import httpx

from .store import Store

log = logging.getLogger("meridian.notify")

PUSH_URL = "https://exp.host/--/api/v2/push/send"
TOKEN = re.compile(r"^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$")


def tokens(store: Store) -> list[dict]:
    return store.get_setting("push.tokens") or []


def add_token(store: Store, token: str, device: str) -> None:
    if not TOKEN.match(token):
        raise ValueError("Ongeldig meldingsadres")
    rest = [t for t in tokens(store) if t["token"] != token]
    store.set_setting("push.tokens", rest + [{"token": token, "device": device[:60] or "telefoon", "at": time.time()}])


def remove_token(store: Store, token: str) -> None:
    store.set_setting("push.tokens", [t for t in tokens(store) if t["token"] != token])


async def send(store: Store, client: httpx.AsyncClient, title: str, body: str, data: dict | None = None) -> int:
    """Stuurt een melding naar alle gekoppelde telefoons. Geeft het aantal geslaagde terug; gooit nooit."""
    targets = tokens(store)
    if not targets:
        return 0
    messages = [{"to": t["token"], "title": title, "body": body, "sound": "default", "channelId": "default",
                 "data": data or {}} for t in targets]
    try:
        r = await client.post(PUSH_URL, json=messages, headers={"Accept": "application/json"}, timeout=15)
        results = r.json().get("data") or []
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Melding versturen mislukt: %s", e)
        return 0
    ok = 0
    for target, res in zip(targets, results):
        if res.get("status") == "ok":
            ok += 1
        elif (res.get("details") or {}).get("error") == "DeviceNotRegistered":
            remove_token(store, target["token"])  # app verwijderd of meldingen uitgezet
        else:
            log.warning("Melding naar %s mislukt: %s", target["device"], res.get("message"))
    return ok
