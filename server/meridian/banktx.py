"""Waar je geld naartoe gaat, uit de transacties in je Rabo-CSV.

Elke transactie krijgt een soort:
- inleg bij Trading 212 of OKX (geld naar je beleggingen; terugstorten telt eraf);
- abonnementen: geld naar je Trading 212-rekening voor je abonnementen;
- eigen rekening: tussen je eigen Rabo-rekeningen (bijv. naar je spaarrekening);
- inkomsten en uitgaven: de rest.

Herkenning gaat eerst via je eigen regels (`python -m meridian bank regel …`), daarna op naam
of omschrijving ("Trading 212", "OKX"). Alles blijft op je eigen server.
"""

from collections import defaultdict
from datetime import date

from .sources import rabocsv
from .store import Store

CATEGORIES = {
    "t212": "Inleg Trading 212",
    "okx": "Inleg OKX",
    "abo": "Abonnementen (Trading 212)",
    "eigen": "Eigen rekening",
    "in": "Inkomsten",
    "uit": "Uitgaven",
}
TRANSFERS = ("t212", "okx", "abo")  # geld dat je zelf wegzet: inleg = wat eraf gaat
RULES_KEY = "bank.rules"
DEFAULT_NAMES = {"t212": ("trading 212", "trading212"), "okx": ("okx", "okcoin")}


def rules(store: Store) -> list[dict]:
    return store.get_setting(RULES_KEY) or []


def add_rule(store: Store, match: str, cat: str) -> list[dict]:
    match = match.strip().replace(" ", "") if _is_iban(match) else match.strip().lower()
    if not match or cat not in CATEGORIES:
        raise ValueError(f"Kies een soort: {', '.join(CATEGORIES)}")
    new = [r for r in rules(store) if r["match"] != match] + [{"match": match, "cat": cat}]
    store.set_setting(RULES_KEY, new)
    return new


def remove_rule(store: Store, index: int) -> list[dict]:
    cur = rules(store)
    if not 0 <= index < len(cur):
        raise ValueError("Die regel bestaat niet.")
    del cur[index]
    store.set_setting(RULES_KEY, cur)
    return cur


def _is_iban(s: str) -> bool:
    s = s.replace(" ", "")
    return len(s) >= 15 and s[:2].isalpha() and s[2:4].isdigit()


def own_ibans(store: Store) -> set[str]:
    linked = {a.get("iban") for a in (store.get_secret("rabobank") or {}).get("accounts") or []}
    return (set(rabocsv.state(store)["accounts"]) | linked | {t["iban"] for t in store.bank_tx()[-500:]}) - {None}


def categorize(tx: dict, own: set[str], user_rules: list[dict]) -> str:
    text = f"{tx.get('counter_name') or ''} {tx.get('descr') or ''}".lower()
    for r in user_rules:
        if r["match"] == (tx.get("counter_iban") or "") or (not _is_iban(r["match"]) and r["match"] in text):
            return r["cat"]
    if tx.get("counter_iban") and tx["counter_iban"] in own:
        return "eigen"
    for cat, names in DEFAULT_NAMES.items():
        if any(n in text for n in names):
            return cat
    return "in" if tx["amount"] > 0 else "uit"


def summary(store: Store, months: int = 12, today: date | None = None) -> dict:
    """Per maand (nieuwste eerst) wat er per soort ging, plus de totale inleg sinds de eerste transactie."""
    today = today or date.today()
    txs = store.bank_tx()
    own, user_rules = own_ibans(store), rules(store)
    per_month: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    totals: dict[str, float] = defaultdict(float)
    for t in txs:
        cat = categorize(t, own, user_rules)
        value = -t["amount"] if cat in TRANSFERS else t["amount"]
        per_month[t["date"][:7]][cat] += value
        if cat in TRANSFERS:
            totals[cat] += value
    first_month = f"{today.year}-{today.month:02d}"
    keys = []
    y, m = today.year, today.month
    for _ in range(months):
        keys.append(f"{y}-{m:02d}")
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    rows = [{"month": k, **{c: round(per_month[k].get(c, 0.0), 2) for c in CATEGORIES}} for k in keys if k in per_month]
    return {
        "categories": CATEGORIES,
        "months": rows,
        "invested": {c: round(totals.get(c, 0.0), 2) for c in TRANSFERS},
        "since": txs[0]["date"] if txs else None,
        "count": len(txs),
        "current": first_month,
    }


def counterparties(store: Store, days_back: int = 120, today: date | None = None) -> list[dict]:
    """De meest voorkomende tegenrekeningen, om regels te kunnen maken."""
    today = today or date.today()
    since = date.fromordinal(today.toordinal() - days_back).isoformat()
    own, user_rules = own_ibans(store), rules(store)
    seen: dict[str, dict] = {}
    for t in store.bank_tx(since):
        key = t.get("counter_iban") or (t.get("counter_name") or "?")
        row = seen.setdefault(key, {"iban": t.get("counter_iban"), "name": t.get("counter_name"), "count": 0, "total": 0.0,
                                    "cat": categorize(t, own, user_rules)})
        row["count"] += 1
        row["total"] = round(row["total"] + t["amount"], 2)
    return sorted(seen.values(), key=lambda r: (-r["count"], r["total"]))[:25]
