"""Meldingen voor de app: een lijstje op de server dat de Meridian-app zelf ophaalt.

Geen Google, geen Expo, geen andere app: de Meridian-app kijkt op de achtergrond
(ongeveer elk kwartier) en zodra je hem opent bij je server of er iets nieuws is,
en toont dat als melding op je telefoon.
"""

import time

import httpx

from .store import Store

KEEP = 50


def events(store: Store, after: int = 0) -> list[dict]:
    """Meldingen nieuwer dan `after` (id), oud → nieuw."""
    return [e for e in store.get_setting("events") or [] if e["id"] > after]


def add(store: Store, title: str, body: str, kind: str = "info") -> dict:
    old = store.get_setting("events") or []
    event = {"id": (old[-1]["id"] + 1) if old else 1, "at": time.time(), "title": title, "body": body, "kind": kind}
    store.set_setting("events", (old + [event])[-KEEP:])
    return event


async def send(store: Store, client: httpx.AsyncClient | None, title: str, body: str, kind: str = "info") -> bool:
    """Zet een melding klaar voor de app. (Async, zodat later ook direct versturen kan.)"""
    add(store, title, body, kind)
    return True
