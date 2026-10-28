import sqlite3
import time
from datetime import datetime

from meridian import config, maintenance, notify, portfolio


def at(d, h):
    return datetime(2026, 11, d, h, 0, tzinfo=config.TZ)


def test_nightly_backup_keeps_14(store, tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    store.set_setting("plan", {"x": 1})
    assert maintenance.backup(store, at(1, 2)) is None  # pas na 03:00
    first = maintenance.backup(store, at(1, 3))
    assert first.name == "meridian-2026-11-01.db"
    assert maintenance.backup(store, at(1, 9)) is None  # één per dag
    row = sqlite3.connect(first).execute("SELECT value FROM settings WHERE key = 'plan'").fetchone()
    assert row is not None
    for d in range(2, 20):
        maintenance.backup(store, at(d, 4))
    kept = sorted(p.name for p in (tmp_path / "backups").glob("*.db"))
    assert len(kept) == 14 and kept[0] == "meridian-2026-11-06.db" and not list((tmp_path / "backups").glob("*.tmp"))


def test_outage_warning_once(store):
    now = time.time()
    portfolio._cache["trezor"] = portfolio.Cached(error="Geen verbinding", at=now - 25 * 3600)
    portfolio._cache["okx"] = portfolio.Cached(error="Kort weg", at=now - 3600)
    sent = maintenance.outages(store, now)
    assert [e["title"] for e in sent] == ["Trezor werkt niet"] and "Geen verbinding" in sent[0]["body"]
    assert maintenance.outages(store, now + 600) == []  # niet elke 10 minuten opnieuw
    portfolio._cache["okx"] = portfolio.Cached(at=now)  # OKX werkt weer
    portfolio._cache["trezor"] = portfolio.Cached(error="Weer weg", at=now + 3600)  # tussendoor even gelukt
    assert len(maintenance.outages(store, now + 26 * 3600)) == 1
    assert [e["kind"] for e in notify.events(store)] == ["warning", "warning"]
