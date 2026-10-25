"""Nieuwe versies van de Meridian-app, zonder Play Store of EAS.

`build/android/bouw.sh` zet de APK met een `versie.json` in de map out/. De server biedt die
aan de gekoppelde app aan; de app vergelijkt het versienummer met zichzelf en installeert
de nieuwe APK na één tik. Android controleert zelf dat de update met dezelfde sleutel is
ondertekend als de geïnstalleerde app.
"""

import asyncio
import json
import logging
from datetime import datetime

from . import config, notify
from .store import Store

log = logging.getLogger("meridian.app")

APK = "meridian.apk"
CHECK_EVERY = 60  # seconden


def info() -> dict | None:
    """De klaarstaande versie, of None als er (nog) geen geldige build is."""
    try:
        data = json.loads((config.APP_DIR / "versie.json").read_text())
        code = int(data["versionCode"])
    except (OSError, ValueError, KeyError, TypeError):
        return None
    apk = config.APP_DIR / APK
    if not apk.is_file():
        return None
    return {"versionCode": code, "version": str(data.get("version", "")), "built": data.get("built"),
            "size": apk.stat().st_size, "sha256": data.get("sha256")}


def apk_path():
    return config.APP_DIR / APK


def announce(store: Store) -> bool:
    """Meldt een nieuwe build één keer via de meldingen. De allereerste build die de server
    ziet, wordt alleen onthouden: die heb je net zelf met de hand geïnstalleerd."""
    cur = info()
    if not cur:
        return False
    seen = store.get_setting("app.announced")
    if seen is not None and cur["versionCode"] <= seen:
        return False
    store.set_setting("app.announced", cur["versionCode"])
    if seen is None:
        return False
    when = f" van {datetime.fromtimestamp(cur['built'], config.TZ):%d-%m %H:%M}" if cur.get("built") else ""
    notify.add(store, "Nieuwe app-versie", f"Versie{when} staat klaar. Open Meridian en tik op Updaten.")
    return True


async def loop(store: Store) -> None:
    while True:
        try:
            announce(store)
        except Exception:  # noqa: BLE001
            log.exception("App-update: onverwachte fout")
        await asyncio.sleep(CHECK_EVERY)
