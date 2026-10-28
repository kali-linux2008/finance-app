"""Onderhoud op de achtergrond: elke nacht een back-up, elk uur de bronnen bijwerken
en een melding als een bron langer dan een dag niet werkt.
"""

import asyncio
import logging
import time
from datetime import datetime
from pathlib import Path

import httpx

from . import config, notify, portfolio
from .store import Store

log = logging.getLogger("meridian.maintenance")

KEEP_BACKUPS = 14
BACKUP_HOUR = 3  # 's nachts, als je de app niet gebruikt
REFRESH_EVERY = 3600
OUTAGE_AFTER = 24 * 3600
CHECK_EVERY = 600


def backup_dir() -> Path:
    return config.DATA_DIR / "backups"


def backup(store: Store, now: datetime) -> Path | None:
    """Eén back-up per dag na 03:00; de oudste worden weggegooid (14 bewaard)."""
    if now.hour < BACKUP_HOUR:
        return None
    folder = backup_dir()
    dest = folder / f"meridian-{now:%Y-%m-%d}.db"
    if dest.exists():
        return None
    folder.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    store.backup(str(tmp))
    tmp.replace(dest)
    dest.chmod(0o600)
    for old in sorted(folder.glob("meridian-*.db"))[:-KEEP_BACKUPS]:
        old.unlink()
    return dest


def outages(store: Store, now: float | None = None) -> list[dict]:
    """Meldt één keer per storing als een bron al een dag niet werkt."""
    now = now or time.time()
    sent = []
    for sid, c in portfolio._cache.items():
        if not c.error:
            continue
        last_ok = c.at or (store.get_setting(f"last.{sid}") or {}).get("at") or 0
        since = last_ok or c.tried
        if not since or now - since < OUTAGE_AFTER or store.get_setting(f"outage.{sid}") == since:
            continue
        store.set_setting(f"outage.{sid}", since)
        name = portfolio.NAMES.get(sid, sid)
        when = datetime.fromtimestamp(last_ok, config.TZ).strftime("%d-%m %H:%M") if last_ok else "nog nooit"
        sent.append(notify.add(store, f"{name} werkt niet", f"Laatst bijgewerkt: {when}. Fout: {c.error[:160]}", "warning"))
    return sent


async def loop(store: Store, client: httpx.AsyncClient) -> None:
    await asyncio.sleep(60)  # eerst rustig opstarten
    last_refresh = 0.0
    while True:
        try:
            now = datetime.now(config.TZ)
            backup(store, now)
            if time.time() - last_refresh >= REFRESH_EVERY:
                last_refresh = time.time()
                # Ook als je de app niet opent, zodat weekoverzicht en mijlpalen kloppen.
                await portfolio.build(store, client)
            outages(store)
        except Exception:  # noqa: BLE001
            log.exception("Onderhoud: onverwachte fout")
        await asyncio.sleep(CHECK_EVERY)
