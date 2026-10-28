"""Echt rendement per broker: wat er nu staat tegenover wat je erin hebt gestort.

De stortingen komen uit je Rabo-CSV (zie banktx.py). Wat je vóór je eerste CSV stortte, kun je
één keer opgeven met `python -m meridian rendement start t212 5000`.
"""

from . import banktx
from .store import Store

BROKERS = {"t212": "Trading 212", "okx": "OKX"}
START_KEY = "returns.start"


def start(store: Store) -> dict[str, float]:
    return {k: 0.0 for k in BROKERS} | (store.get_setting(START_KEY) or {})


def set_start(store: Store, broker: str, amount: float) -> dict[str, float]:
    if broker not in BROKERS:
        raise ValueError("Kies t212 of okx.")
    cur = start(store)
    cur[broker] = round(float(amount), 2)
    store.set_setting(START_KEY, cur)
    return cur


def broker_values(positions: list[dict]) -> dict[str, float]:
    """Wat er nu bij elke broker staat (BTC op je Trezor telt niet mee bij OKX)."""
    out = {k: 0.0 for k in BROKERS}
    for p in positions:
        if p["id"].startswith("t212"):
            out["t212"] += float(p.get("value") or 0)
        elif p["id"].startswith("okx"):
            out["okx"] += float(p.get("value") or 0)
        elif p.get("wallets"):
            out["okx"] += sum(float(w.get("value") or 0) for w in p["wallets"] if "OKX" in w.get("name", ""))
    return {k: round(v, 2) for k, v in out.items()}


def compute(store: Store, positions: list[dict]) -> dict:
    deposits = banktx.summary(store, months=1)["invested"]
    base = start(store)
    values = broker_values(positions)
    rows = []
    for k, name in BROKERS.items():
        invested = round(base[k] + deposits.get(k, 0.0), 2)
        gain = round(values[k] - invested, 2)
        rows.append({"broker": k, "name": name, "value": values[k], "invested": invested, "gain": gain,
                     "pct": round(gain / invested * 100, 1) if invested > 0 else None})
    inv = sum(r["invested"] for r in rows)
    val = sum(r["value"] for r in rows)
    return {"brokers": rows, "invested": round(inv, 2), "value": round(val, 2), "gain": round(val - inv, 2),
            "pct": round((val - inv) / inv * 100, 1) if inv > 0 else None,
            "since": banktx.summary(store, months=1)["since"], "start": base}
