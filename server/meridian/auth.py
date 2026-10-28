"""Je telefoon koppelen: eenmalige koppelcode (10 min geldig) → lange geheime sleutel voor de app."""

import hashlib
import secrets
import time

from .store import Store

CODE_TTL = 600
MAX_ATTEMPTS = 5


def _h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def new_pair_code(store: Store) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    with store.tx() as c:
        c.execute("DELETE FROM pair_codes WHERE expires < ?", (time.time(),))
        c.execute("INSERT INTO pair_codes VALUES (?, ?, 0)", (_h(code), time.time() + CODE_TTL))
    return code


def redeem_pair_code(store: Store, code: str, device: str) -> str | None:
    """Geeft een nieuwe apparaat-sleutel terug, of None bij een ongeldige/verlopen code."""
    now = time.time()
    with store.tx() as c:
        c.execute("DELETE FROM pair_codes WHERE expires < ? OR attempts >= ?", (now, MAX_ATTEMPTS))
        row = c.execute("SELECT code_hash FROM pair_codes WHERE code_hash = ?", (_h(code.strip()),)).fetchone()
        if not row:
            # Elke foute poging telt mee voor alle open codes, zodat raden geen zin heeft.
            c.execute("UPDATE pair_codes SET attempts = attempts + 1")
            return None
        c.execute("DELETE FROM pair_codes WHERE code_hash = ?", (row[0],))
        token = secrets.token_urlsafe(32)
        c.execute("INSERT INTO devices VALUES (?, ?, ?, NULL)", (_h(token), device[:60] or "telefoon", now))
    return token


SEEN_EVERY = 300  # "laatst gezien" hooguit elke 5 minuten bijwerken, niet bij elk verzoek


def check_token(store: Store, token: str) -> bool:
    h, now = _h(token), time.time()
    row = store._one("SELECT last_seen FROM devices WHERE token_hash = ?", (h,))
    if not row:
        return False
    if row[0] is None or now - row[0] > SEEN_EVERY:
        with store.tx() as c:
            c.execute("UPDATE devices SET last_seen = ? WHERE token_hash = ?", (now, h))
    return True
