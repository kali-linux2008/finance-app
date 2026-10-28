"""Rabobank-saldi uit een CSV-bestand (Rabo Online Bankieren → Download transacties → CSV).

Voor rekeningen die de bankkoppeling niet doorgeeft, zoals je spaarrekening. Elke regel in
het bestand heeft het saldo ná die transactie ("Saldo na trn"); per rekening nemen we de
nieuwste regel. Er gaat niets naar buiten: het bestand wordt alleen op je server gelezen.
"""

import csv
import io
import time
from datetime import date

from ..models import Position, SourceResult
from ..store import Store

KEY = "rabocsv"
STALE_DAYS = 14
MAX_BYTES = 5_000_000


class CsvError(Exception):
    pass


def decode(raw: bytes) -> str:
    if len(raw) > MAX_BYTES:
        raise CsvError("Dit bestand is te groot. Download een kortere periode (bijv. de laatste maand).")
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def amount(raw: str) -> float:
    """'+1234,56', '-12,50' of '1.234,56' → float."""
    s = raw.strip().replace(" ", "").replace("\u00a0", "")
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    return float(s)


def parse(text: str) -> dict[str, dict]:
    """Per IBAN het saldo van de nieuwste transactie: {iban: {balance, date, cur}}."""
    reader = csv.DictReader(io.StringIO(text.lstrip("\ufeff")), delimiter=",", quotechar='"')
    fields = reader.fieldnames or []
    if "IBAN/BBAN" not in fields or "Saldo na trn" not in fields:
        raise CsvError("Dit is geen CSV-bestand van de Rabobank. Kies bij het downloaden het formaat CSV.")
    latest: dict[str, tuple] = {}
    for r in reader:
        iban = (r.get("IBAN/BBAN") or "").strip().replace(" ", "")
        if not iban or not (r.get("Saldo na trn") or "").strip():
            continue
        try:
            when = date.fromisoformat((r.get("Datum") or "").strip())
            seq = int((r.get("Volgnr") or "0").strip() or 0)
            bal = amount(r["Saldo na trn"])
        except ValueError:
            continue
        if iban not in latest or (when, seq) > latest[iban][:2]:
            latest[iban] = (when, seq, bal, (r.get("Munt") or "EUR").strip() or "EUR")
    if not latest:
        raise CsvError("Geen saldo gevonden in dit bestand. Staan er transacties in de gekozen periode?")
    return {iban: {"balance": round(b, 2), "date": d.isoformat(), "cur": cur} for iban, (d, _, b, cur) in latest.items()}


def save(store: Store, parsed: dict[str, dict], now: float | None = None) -> dict:
    """Voegt toe aan wat er al was; een ouder bestand overschrijft geen nieuwer saldo."""
    now = now or time.time()
    data = store.get_setting(KEY) or {"accounts": {}, "uploaded": None}
    for iban, v in parsed.items():
        old = data["accounts"].get(iban)
        if not old or v["date"] >= old["date"]:
            data["accounts"][iban] = v
    data["uploaded"] = now
    store.set_setting(KEY, data)
    return data


def state(store: Store) -> dict:
    return store.get_setting(KEY) or {"accounts": {}, "uploaded": None}


def source(store: Store, skip_ibans: set[str], today: date | None = None) -> SourceResult | None:
    """Rekeningen uit de CSV die niet al via de bankkoppeling binnenkomen."""
    accounts = {i: v for i, v in state(store)["accounts"].items() if i not in skip_ibans}
    if not accounts:
        return None
    today = today or date.today()
    res = SourceResult(id=KEY, name="Rabobank (CSV)", sub="uit je CSV-bestand")
    for iban, v in sorted(accounts.items()):
        if v.get("cur", "EUR") != "EUR":
            continue
        d = date.fromisoformat(v["date"])
        res.positions.append(Position(
            id=f"rabocsv-{iban[-6:]}", tk="RABO", name=f"Spaarrekening ·{iban[-4:]}", cls="Cash", cat="cash",
            src="Rabobank", value=v["balance"], tile=3,
            note=f"Saldo uit je CSV-bestand, laatste transactie op {d.day}-{d.month}-{d.year}.",
        ))
        if (today - d).days > STALE_DAYS + 30:
            res.warnings.append(f"Rabobank ·{iban[-4:]}: het saldo is van {d.day}-{d.month}. Stuur een nieuwe CSV.")
    return res
