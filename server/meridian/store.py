"""Opslag in SQLite. Geheimen (API-sleutels, xpub) staan versleuteld met Fernet (AES + HMAC)."""

import json
import sqlite3
import threading
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
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, ts REAL NOT NULL, request_id TEXT UNIQUE, broker TEXT NOT NULL, demo INTEGER NOT NULL,
  action TEXT NOT NULL, symbol TEXT NOT NULL, kind TEXT, amount REAL, qty REAL, price REAL,
  ok INTEGER NOT NULL, broker_id TEXT, message TEXT
);
"""

ORDER_FIELDS = ("id", "ts", "request_id", "broker", "demo", "action", "symbol", "kind", "amount", "qty", "price",
                "ok", "broker_id", "message")


class Store:
    def __init__(self, path=None, key: str | None = None):
        self.path = str(path or config.DB_PATH)
        if self.path != ":memory:":
            config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._key = key
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.executescript(SCHEMA)
        # Eén verbinding voor alle verzoeken; de app vraagt soms twee dingen tegelijk. Daarom om de beurt.
        self._lock = threading.RLock()

    @property
    def fernet(self) -> Fernet:
        return Fernet((self._key or config.master_key()).encode())

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock, self._conn:
            yield self._conn

    def _one(self, sql: str, params: tuple = ()) -> tuple | None:
        with self._lock:
            return self._conn.execute(sql, params).fetchone()

    def _all(self, sql: str, params: tuple = ()) -> list[tuple]:
        with self._lock:
            return self._conn.execute(sql, params).fetchall()

    # Geheimen per bron (versleuteld)
    def set_secret(self, source: str, data: dict[str, Any]) -> None:
        blob = self.fernet.encrypt(json.dumps(data).encode())
        with self.tx() as c:
            c.execute("REPLACE INTO secrets VALUES (?, ?, ?)", (source, blob, time.time()))

    def get_secret(self, source: str) -> dict[str, Any] | None:
        row = self._one("SELECT blob FROM secrets WHERE source = ?", (source,))
        return json.loads(self.fernet.decrypt(row[0])) if row else None

    def delete_secret(self, source: str) -> None:
        with self.tx() as c:
            c.execute("DELETE FROM secrets WHERE source = ?", (source,))

    def sources(self) -> list[str]:
        return [r[0] for r in self._all("SELECT source FROM secrets ORDER BY source")]

    # Gewone instellingen (bijv. handmatige bezittingen)
    def set_setting(self, key: str, value: Any) -> None:
        with self.tx() as c:
            c.execute("REPLACE INTO settings VALUES (?, ?)", (key, json.dumps(value)))

    def get_setting(self, key: str, default: Any = None) -> Any:
        row = self._one("SELECT value FROM settings WHERE key = ?", (key,))
        return json.loads(row[0]) if row else default

    # Waardeverloop voor de grafiek
    def add_snapshot(self, total: float, ts: float | None = None, min_gap: float = 600) -> None:
        """Bewaart het totaal hooguit eens per 10 minuten."""
        ts = ts or time.time()
        last = self._one("SELECT MAX(ts) FROM snapshots")[0]
        if last is not None and ts - last < min_gap:
            return
        with self.tx() as c:
            c.execute("INSERT OR REPLACE INTO snapshots VALUES (?, ?)", (ts, total))

    def snapshots(self, since: float) -> list[tuple[float, float]]:
        return self._all("SELECT ts, total FROM snapshots WHERE ts >= ? ORDER BY ts", (since,))

    def snapshot_before(self, ts: float) -> tuple[float, float] | None:
        return self._one("SELECT ts, total FROM snapshots WHERE ts < ? ORDER BY ts DESC LIMIT 1", (ts,))

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

    # Orderlogboek: elke poging om te handelen, ook mislukte, annuleringen en wijzigingen.
    def log_order(self, **row: Any) -> dict:
        row = {"ts": time.time(), **row}
        cols = [k for k in ORDER_FIELDS if k in row]
        with self.tx() as c:
            cur = c.execute(f"INSERT INTO orders ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
                            [row[k] for k in cols])
        return {**row, "id": cur.lastrowid}

    def order_by_request(self, request_id: str) -> dict | None:
        row = self._one(f"SELECT {', '.join(ORDER_FIELDS)} FROM orders WHERE request_id = ?", (request_id,))
        return dict(zip(ORDER_FIELDS, row)) if row else None

    def orders_log(self, limit: int = 20) -> list[dict]:
        rows = self._all(f"SELECT {', '.join(ORDER_FIELDS)} FROM orders ORDER BY ts DESC LIMIT ?", (limit,))
        return [dict(zip(ORDER_FIELDS, r)) for r in rows]

    def traded_since(self, ts: float) -> float:
        """Totaal in euro van geslaagde kopen/verkopen sinds `ts` (voor het dagmaximum)."""
        row = self._one("SELECT COALESCE(SUM(amount), 0) FROM orders WHERE ok = 1 AND action IN ('kopen', 'verkopen') AND ts >= ?", (ts,))
        return float(row[0])
