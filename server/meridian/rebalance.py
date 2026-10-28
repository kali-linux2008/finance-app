"""Herbalanceren: je doelverdeling per klasse en wat je moet doen om daar te komen.

Twee manieren (zoals in het ontwerp):
- "Alleen bijkopen": nieuw geld zo verdelen dat de klassen die achterlopen het eerst aangevuld
  worden. Er wordt niets verkocht (geen winst of kosten bij verkoop).
- "Kopen & verkopen": voorgestelde orders om in één keer op het doel uit te komen. Aandelen
  gaan via Trading 212, crypto via OKX. Cash en goud kan de app niet verhandelen; dat staat
  onder "Zelf doen" (bijv. geld overmaken).

Uitvoeren gaat via dezelfde weg als een gewone order: bevestigen met vingerafdruk,
het dagmaximum geldt, en elke order heeft een vaste id zodat hij nooit dubbel gaat.
"""

from . import trading
from .store import Store

CLASSES = {"eq": "Aandelen & ETF's", "cr": "Crypto", "cash": "Cash", "gold": "Goud"}
KEY = "rebalance.targets"
STEP = 5
MIN_ORDER = 10.0  # kleinere orders laten we weg (kosten en minimum van de broker)
TOLERANCE = 1.0  # binnen 1 procentpunt van het doel: niets doen


class RebalanceError(Exception):
    pass


def get_targets(store: Store) -> dict[str, int] | None:
    return store.get_setting(KEY)


def validate(targets: dict) -> dict[str, int]:
    clean: dict[str, int] = {}
    for k, v in targets.items():
        if k not in CLASSES:
            raise RebalanceError(f"Onbekende klasse: {k}")
        try:
            n = int(round(float(v)))
        except (TypeError, ValueError) as e:
            raise RebalanceError("Een doel moet een getal zijn.") from e
        if n < 0 or n > 100 or n % STEP:
            raise RebalanceError(f"Kies doelen in stappen van {STEP}% (0–100%).")
        clean[k] = n
    for k in CLASSES:
        clean.setdefault(k, 0)
    if sum(clean.values()) != 100:
        raise RebalanceError(f"Samen moeten de doelen 100% zijn (nu {sum(clean.values())}%).")
    return clean


def current(positions: list[dict]) -> dict[str, float]:
    out = {k: 0.0 for k in CLASSES}
    for p in positions:
        if p.get("cat") in out:
            out[p["cat"]] += float(p.get("value") or 0)
    return {k: round(v, 2) for k, v in out.items()}


def analyse(positions: list[dict], targets: dict[str, int]) -> list[dict]:
    now = current(positions)
    total = sum(now.values())
    rows = []
    for k, name in CLASSES.items():
        want = total * targets[k] / 100
        rows.append({
            "cls": k, "name": name, "value": now[k], "target": targets[k],
            "pct": round(now[k] / total * 100, 1) if total else 0.0,
            "diff": round(want - now[k], 2),  # positief = te weinig, negatief = te veel
        })
    return rows


def buy_only(rows: list[dict], amount: float) -> list[dict]:
    """Verdeelt nieuw geld: eerst naar wat het verst achterloopt, de rest naar de doelverdeling."""
    if amount <= 0:
        return []
    short = {r["cls"]: max(r["diff"], 0) for r in rows}
    need = sum(short.values())
    split = {k: 0.0 for k in short}
    if need > 0:
        part = min(amount, need)
        for k, v in short.items():
            split[k] += part * v / need
    rest = amount - sum(split.values())
    if rest > 0.005:
        targets = {r["cls"]: r["target"] for r in rows}
        for k, t in targets.items():
            split[k] += rest * t / 100
    return [{"cls": k, "name": CLASSES[k], "amount": round(v, 2)} for k, v in split.items() if v >= 0.5]


def _sellable(p: dict) -> float:
    """Wat Meridian van deze positie mag verkopen (BTC op de Trezor bijvoorbeeld niet)."""
    if p["id"].startswith("t212-"):
        return float(p.get("value") or 0)
    if p.get("cat") == "cr":
        wallets = p.get("wallets") or []
        if wallets:
            return sum(float(w.get("value") or 0) for w in wallets if "OKX" in w.get("name", ""))
        return float(p.get("value") or 0) if "OKX" in (p.get("src") or "") else 0.0
    return 0.0


def proposals(positions: list[dict], rows: list[dict]) -> dict:
    """Orders (aandelen/crypto) en zelf-doen-taken (cash/goud) om op het doel uit te komen."""
    orders, manual = [], []
    total = sum(r["value"] for r in rows)
    for r in rows:
        if not total or abs(r["diff"]) / total * 100 < TOLERANCE:
            continue
        if r["cls"] in ("cash", "gold"):
            what = "Geld" if r["cls"] == "cash" else "Goud"
            verb = "erbij" if r["diff"] > 0 else "eraf"
            manual.append({"cls": r["cls"], "amount": round(abs(r["diff"]), 2),
                           "text": f"{what} {verb}: {trading._eur(abs(r['diff']))}"})
            continue
        tradeable = [p for p in positions if p.get("cat") == r["cls"] and trading.product_from(p)]
        if r["diff"] > 0:
            pool = [(p, float(p.get("value") or 0)) for p in tradeable]
            side, left = "kopen", r["diff"]
        else:
            pool = [(p, _sellable(p)) for p in tradeable]
            side, left = "verkopen", -r["diff"]
        weight = sum(w for _, w in pool)
        if not weight:
            manual.append({"cls": r["cls"], "amount": round(left, 2),
                           "text": f"{r['name']}: {trading._eur(left)} {side}, maar Meridian kan hier niets mee"})
            continue
        for p, w in sorted(pool, key=lambda x: -x[1]):
            amount = round(left * w / weight, 2)
            if side == "verkopen":
                amount = min(amount, round(w, 2))
            if amount >= MIN_ORDER:
                prod = trading.product_from(p)
                orders.append({"posId": p["id"], "tk": p["tk"], "name": p["name"], "side": side,
                               "amount": amount, "broker": prod.broker, "brokerName": trading.NAMES[prod.broker]})
    orders.sort(key=lambda o: o["side"] != "verkopen")  # eerst verkopen, dan is er geld om te kopen
    return {"orders": orders, "manual": manual}


async def execute(store: Store, client, orders: list[dict], request_id: str) -> list[dict]:
    """Voert de aangevinkte orders uit, één voor één. Een fout stopt de rest niet."""
    if not request_id or len(request_id) > 40:
        raise RebalanceError("Ongeldige aanvraag.")
    if not orders or len(orders) > 20:
        raise RebalanceError("Kies 1 tot 20 orders.")
    results = []
    for i, o in enumerate(orders):
        req = trading.OrderRequest(str(o.get("posId", "")), str(o.get("side", "")), float(o.get("amount") or 0),
                                   "markt", 0.0, f"rb-{request_id}-{i}")
        try:
            res = await trading.place(store, client, req)
            results.append({**o, "ok": res["ok"], "message": res.get("message")})
        except trading.TradeError as e:
            results.append({**o, "ok": False, "message": str(e)})
    return results
