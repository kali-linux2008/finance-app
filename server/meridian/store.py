"""Opslag in SQLite. Geheimen (API-sleutels, xpub) staan versleuteld met Fernet (AES + HMAC)."""

import json
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Iterator

from cryptography.fernet import Fernet

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS secrets (source TEXT PRIMARY KEY, blob BLOB NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices (token_hash TEXT PRIMARY KEY, name TEXT NOT NULL, created REAL NOT NULL, last_seen REAL);
CREATE TABLE IF NOT EXISTS pair_codes (code_hash TEXT PRIMARY KEY, expires REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS snapshots (ts REAL PRIMARY KEY, total REAL NOT NULL);
"""


class Store:
    def __init__(self, path=None, key: str | None = None):
        self.path = str(path or config.DB_PATH)
        if self.path != ":memory:":
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._key = key
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.executescript(SCHEMA)

    @property
    def fernet(self) -> Fernet:
        return Fernet((self._key or config.master_key()).encode())

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self._conn:
            yield self._conn

    # Geheimen per bron (versleuteld)
    def set_secret(self, source: str, data: dict[str, Any]) -> None:
        blob = self.fernet.encrypt(json.dumps(data).encode())
        with self.tx() as c:
            c.execute("REPLACE INTO secrets VALUES (?, ?, ?)", (source, blob, time.time()))

    def get_secret(self, source: str) -> dict[str, Any] | None:
        row = self._conn.execute("SELECT blob FROM secrets WHERE source = ?", (source,)).fetchone()
        return json.loads(self.fernet.decrypt(row[0])) if row else None

    def delete_secret(self, source: str) -> None:
        with self.tx() as c:
            c.execute("DELETE FROM secrets WHERE source = ?", (source,))

    def sources(self) -> list[str]:
        return [r[0] for r in self._conn.execute("SELECT source FROM secrets ORDER BY source")]

    # Gewone instellingen (bijv. handmatige bezittingen)
    def set_setting(self, key: str, value: Any) -> None:
        with self.tx() as c:
            c.execute("REPLACE INTO settings VALUES (?, ?)", (key, json.dumps(value)))

    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self._conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    # Waardeverloop voor de grafiek
    def add_snapshot(self, total: float, ts: float | None = None, min_gap: float = 600) -> None:
        """Bewaart het totaal hooguit eens per 10 minuten."""
        ts = ts or time.time()
        last = self._conn.execute("SELECT MAX(ts) FROM snapshots").fetchone()[0]
        if last is not None and ts - last < min_gap:
            return
        with self.tx() as c:
            c.execute("INSERT OR REPLACE INTO snapshots VALUES (?, ?)", (ts, total))

    def snapshots(self, since: float) -> list[tuple[float, float]]:
        return list(self._conn.execute("SELECT ts, total FROM snapshots WHERE ts >= ? ORDER BY ts", (since,)))

    def snapshot_before(self, ts: float) -> tuple[float, float] | None:
        return self._conn.execute(
            "SELECT ts, total FROM snapshots WHERE ts < ? ORDER BY ts DESC LIMIT 1", (ts,)
        ).fetchone()

    def prune_snapshots(self, now: float | None = None) -> None:
        """Ouder dan 2 dagen: alleen de laatste meting per dag bewaren."""
        now = now or time.time()
        cutoff = now - 2 * 86400
        with self.tx() as c:
            c.execute(
                """DELETE FROM snapshots WHERE ts < ? AND ts NOT IN (
                     SELECT MAX(ts) FROM snapshots WHERE ts < ? GROUP BY CAST(ts / 86400 AS INTEGER))""",
                (cutoff, cutoff),
            )
