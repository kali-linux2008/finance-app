"""Pushmeldingen via je eigen ntfy-server (draait naast Meridian in docker compose).

De ntfy-app op je telefoon houdt verbinding met jouw server en toont de meldingen.
Alles blijft in je eigen netwerk (thuis of via Tailscale): geen Google, geen Expo.
Het onderwerp ("topic") is een lange willekeurige naam; wie die niet kent, ziet niets.
"""

import logging
import secrets

import httpx

from . import config
from .store import Store

log = logging.getLogger("meridian.notify")


def topic(store: Store, new: bool = False) -> str:
    """Geheime onderwerpnaam voor je meldingen; wordt één keer aangemaakt en bewaard."""
    current = store.get_setting("push.topic")
    if current and not new:
        return current
    name = "meridian-" + secrets.token_urlsafe(18)
    store.set_setting("push.topic", name)
    return name


async def send(store: Store, client: httpx.AsyncClient, title: str, body: str, tags: list[str] | None = None) -> bool:
    """Stuurt een melding. Geeft True terug als ntfy hem aannam; gooit nooit."""
    message = {"topic": topic(store), "title": title, "message": body, "tags": tags or ["moneybag"]}
    try:
        r = await client.post(config.NTFY_URL, json=message, timeout=10)
    except httpx.HTTPError as e:
        log.warning("Melding versturen mislukt (%s): %s", config.NTFY_URL, e.__class__.__name__)
        return False
    if r.status_code >= 400:
        log.warning("Melding versturen mislukt: ntfy gaf %s", r.status_code)
        return False
    return True
