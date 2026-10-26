"""Rabobank: saldi van je betaal- en spaarrekeningen, alleen-lezen.

Meridian mag als privépersoon niet rechtstreeks bij de bank (daarvoor is een PSD2-vergunning
nodig). Daarom via Enable Banking: gratis voor wie alleen zijn eigen rekeningen koppelt.

- Je maakt bij Enable Banking een "applicatie" en krijgt een Application ID en een privésleutel
  (.pem). Die staan versleuteld op de server, nooit in de app of in git.
- Daarna geef je in de Rabo-app toestemming om je saldi te lezen (maximaal 180 dagen).
- Banken staan zonder dat jij erbij bent hooguit 4 keer per dag een opvraging toe; de server
  haalt de saldi daarom hooguit elke 6 uur op.
"""

import base64
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from ..models import Position, SourceResult

API = "https://api.enablebanking.com"
BANK, COUNTRY = "Rabobank", "NL"
# Saldotypen op volgorde van voorkeur (geboekt saldo eerst).
BALANCE_TYPES = ["CLBD", "ITBD", "XPCD", "ITAV", "CLAV", "OPBD"]
WARN_DAYS = 14
# Na het inloggen stuurt de bank je naar dit adres met ?code=… erachter. Het hoeft niet te laden:
# je kopieert het adres en plakt het op de server. Zo komt de code nergens anders terecht.
DEFAULT_REDIRECT = "https://localhost/meridian"


class BankError(Exception):
    pass


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def token(secret: dict, now: float | None = None) -> str:
    """JWT (RS256) waarmee de server zich bij Enable Banking meldt; een uur geldig."""
    iat = int(now or time.time())
    head = _b64(json.dumps({"typ": "JWT", "alg": "RS256", "kid": secret["app_id"]}).encode())
    body = _b64(json.dumps({"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": iat, "exp": iat + 3600}).encode())
    key = serialization.load_pem_private_key(secret["key_pem"].encode(), password=None)
    sig = key.sign(f"{head}.{body}".encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{head}.{body}.{_b64(sig)}"


def check_key(pem: str) -> None:
    try:
        serialization.load_pem_private_key(pem.encode(), password=None)
    except (ValueError, TypeError) as e:
        raise BankError("Dit is geen geldige privésleutel (.pem) van Enable Banking.") from e


async def request(client: httpx.AsyncClient, secret: dict, method: str, path: str, body: dict | None = None) -> dict:
    try:
        r = await client.request(method, API + path, json=body, headers={"Authorization": f"Bearer {token(secret)}"})
    except httpx.HTTPError as e:
        raise BankError("Enable Banking is niet bereikbaar") from e
    try:
        data = r.json()
    except ValueError:
        data = {}
    if r.status_code >= 400:
        msg = data.get("message") or data.get("error") or data.get("detail") or r.text[:200]
        if r.status_code == 401:
            raise BankError(f"Enable Banking weigert de sleutel (401): klopt de Application ID bij de .pem? {msg}")
        if r.status_code in (403, 422) and "consent" in str(msg).lower():
            raise BankError("De toestemming van de bank is verlopen. Koppel opnieuw: python -m meridian bron rabobank")
        raise BankError(f"Enable Banking gaf fout {r.status_code}: {msg}")
    return data


async def find_bank(client: httpx.AsyncClient, secret: dict) -> dict:
    data = await request(client, secret, "GET", f"/aspsps?country={COUNTRY}")
    for a in data.get("aspsps", []):
        if BANK.lower() in a.get("name", "").lower() and "business" not in a.get("name", "").lower():
            return a
    raise BankError("Rabobank staat niet in de lijst van Enable Banking.")


async def start(client: httpx.AsyncClient, secret: dict, redirect_url: str) -> tuple[str, str]:
    """Begint de toestemming bij de bank. Geeft (url om te openen, state) terug."""
    bank = await find_bank(client, secret)
    seconds = int(bank.get("maximum_consent_validity") or 180 * 86400)
    until = datetime.now(timezone.utc) + timedelta(seconds=min(seconds, 180 * 86400) - 600)
    state = uuid.uuid4().hex
    data = await request(client, secret, "POST", "/auth", {
        "access": {"valid_until": until.isoformat()},
        "aspsp": {"name": bank["name"], "country": COUNTRY},
        "state": state,
        "redirect_url": redirect_url,
        "psu_type": "personal",
    })
    return data["url"], state


def code_from(redirected: str, state: str | None = None) -> str:
    """Haalt de code uit het adres waar je na het inloggen bij de bank op uitkwam."""
    q = parse_qs(urlparse(redirected.strip()).query)
    if q.get("error"):
        raise BankError(f"De bank gaf geen toestemming: {q.get('error_description', q['error'])[0]}")
    if state and q.get("state", [state])[0] != state:
        raise BankError("Dit adres hoort niet bij deze koppeling (state klopt niet). Begin opnieuw.")
    if not q.get("code"):
        raise BankError("Geen code gevonden. Plak het hele adres uit de adresbalk (met ?code=…).")
    return q["code"][0]


async def finish(client: httpx.AsyncClient, secret: dict, code: str) -> dict:
    """Maakt de sessie aan; geeft het secret met sessie en rekeningen terug."""
    data = await request(client, secret, "POST", "/sessions", {"code": code})
    accounts = [{
        "uid": a["uid"],
        "iban": (a.get("account_id") or {}).get("iban"),
        "label": a.get("product") or a.get("details") or None,
        "savings": a.get("cash_account_type") == "SVGS",
    } for a in data.get("accounts", []) if a.get("uid")]
    if not accounts:
        raise BankError("De bank gaf geen rekeningen door. Vink je rekeningen aan bij het geven van toestemming.")
    valid_until = (data.get("access") or {}).get("valid_until")
    return {**secret, "session_id": data["session_id"], "accounts": accounts, "valid_until": valid_until}


def pick_balance(balances: list[dict]) -> float | None:
    by_type = {b.get("balance_type"): b for b in balances}
    for t in BALANCE_TYPES:
        if t in by_type:
            return float(by_type[t]["balance_amount"]["amount"])
    return float(balances[0]["balance_amount"]["amount"]) if balances else None


def _name(acc: dict) -> str:
    tail = f" ·{acc['iban'][-4:]}" if acc.get("iban") else ""
    return (acc.get("label") or ("Spaarrekening" if acc.get("savings") else "Betaalrekening")) + tail


def days_left(valid_until: str | None, now: datetime | None = None) -> int | None:
    if not valid_until:
        return None
    until = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
    return (until - (now or datetime.now(timezone.utc))).days


async def fetch(client: httpx.AsyncClient, secret: dict) -> SourceResult:
    if not secret.get("session_id"):
        raise BankError("Nog geen toestemming van de bank. Koppel: python -m meridian bron rabobank")
    left = days_left(secret.get("valid_until"))
    if left is not None and left < 0:
        raise BankError("De toestemming van de bank is verlopen. Koppel opnieuw: python -m meridian bron rabobank")
    res = SourceResult(id="rabobank", name="Rabobank", sub="via PSD2")
    for acc in secret["accounts"]:
        data = await request(client, secret, "GET", f"/accounts/{acc['uid']}/balances")
        value = pick_balance(data.get("balances", []))
        if value is None:
            res.warnings.append(f"Rabobank: geen saldo voor {_name(acc)}")
            continue
        res.positions.append(Position(
            id=f"rabo-{acc['uid'][:12]}", tk="RABO", name=_name(acc), cls="Cash", cat="cash", src="Rabobank",
            value=round(value, 2), tile=3 if acc.get("savings") else 4,
            note="Saldo via je bank (PSD2, Enable Banking), hooguit elke 6 uur bijgewerkt.",
        ))
    if left is not None and left <= WARN_DAYS:
        res.warnings.append(f"Rabobank: toestemming verloopt over {left} dagen. Vernieuwen: python -m meridian bron rabobank")
    return res
