"""Wekelijkse herinnering om een nieuw CSV-bestand van de Rabobank te sturen.

Standaard op zondag om 10:00. Heb je de afgelopen 3 dagen al een bestand gestuurd, dan
slaat de server de herinnering die week over.
"""

import asyncio
import logging
from datetime import datetime

from . import config, notify
from .sources import rabocsv
from .store import Store

log = logging.getLogger("meridian.reminders")

KEY = "csv.reminder"
DEFAULT = {"on": True, "day": 6, "hour": 10}  # 0 = maandag … 6 = zondag
DAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"]
SKIP_IF_UPLOADED = 3 * 86400
CHECK_EVERY = 600


def settings(store: Store) -> dict:
    return {**DEFAULT, **(store.get_setting(KEY) or {})}


def due(store: Store, now: datetime) -> bool:
    s = settings(store)
    if not s["on"] or now.weekday() != s["day"] or now.hour < s["hour"]:
        return False
    week = f"{now.isocalendar().year}-W{now.isocalendar().week}"
    if store.get_setting("csv.reminded") == week:
        return False
    store.set_setting("csv.reminded", week)  # deze week niet nog eens, ook als we hem overslaan
    uploaded = rabocsv.state(store).get("uploaded")
    return not (uploaded and now.timestamp() - uploaded < SKIP_IF_UPLOADED)


def describe(store: Store) -> str:
    s = settings(store)
    return f"elke {DAYS[s['day']]} om {s['hour']}:00" if s["on"] else "uit"


async def loop(store: Store) -> None:
    while True:
        try:
            if due(store, datetime.now(config.TZ)):
                notify.add(store, "Rabo-CSV", "Tijd voor je wekelijkse CSV: download hem in Rabo Online Bankieren en tik hier om hem te kiezen.", "csv")
        except Exception:  # noqa: BLE001
            log.exception("Herinnering: onverwachte fout")
        await asyncio.sleep(CHECK_EVERY)


