"""Handmatige bezittingen: bankrekeningen (bijv. Rabobank), goud, pensioen en woning.

Een echte bankkoppeling via PSD2 komt later; tot die tijd vul je saldi zelf in met
`python -m meridian handmatig`.
"""

import httpx

from .. import prices
from ..models import Position, SourceResult

EMPTY = {"banks": [], "gold_grams": 0, "gold_price": None, "pension": None, "home": None}


def normalize(data: dict | None) -> dict:
    return {**EMPTY, **(data or {})}


def bank_source(data: dict) -> SourceResult | None:
    banks = data["banks"]
    if not banks:
        return None
    bank_names = sorted({b.get("bank") or "Bank" for b in banks})
    res = SourceResult(id="bank", name=" · ".join(bank_names), sub="handmatig")
    for i, b in enumerate(banks):
        savings = b.get("kind") == "spaar"
        res.positions.append(Position(
            id=f"bank-{i}", tk=(b.get("bank") or "BANK")[:4].upper(), name=b["name"], cls="Cash", cat="cash",
            src=b.get("bank") or "Bank", value=round(float(b["value"]), 2), tile=3 if savings else 4,
            rate=b.get("rate"), note="Handmatig ingevoerd. Een echte bankkoppeling komt later.", manual=True,
        ))
    rates = [b["rate"] for b in banks if b.get("rate")]
    if rates:
        res.sub = rates[0]
    return res


async def gold_source(client: httpx.AsyncClient, data: dict) -> SourceResult | None:
    grams = float(data.get("gold_grams") or 0)
    if grams <= 0:
        return None
    res = SourceResult(id="manual", name="Handmatig", sub=f"goud · {grams:g} g".replace(".", ","))
    try:
        per_gram = await prices.gold_per_gram_eur(client)
    except prices.PriceError:
        per_gram = data.get("gold_price")
        if not per_gram:
            res.warnings.append("Geen goudprijs gevonden; vul er een in met `handmatig`.")
            return res
        res.warnings.append("Goudkoers niet bereikbaar; je eigen reserveprijs per gram is gebruikt.")
    res.positions.append(Position(
        id="manual-gold", tk="XAU", name=f"Goud · {grams:g} g".replace(".", ","), cls="Goud", cat="gold",
        src="Handmatig", value=round(grams * float(per_gram), 2), tile=5, qty=grams, unit="g",
        price=round(float(per_gram), 2), cur="EUR", manual=True,
        note="Fysiek goud, handmatig ingevoerd. Waarde volgt de goudprijs (via XAUT).",
    ))
    return res


def outside(data: dict) -> dict | None:
    """Pensioen en woning tellen niet mee in je belegd vermogen."""
    pension, home = data.get("pension"), data.get("home")
    if not pension and not home:
        return None
    out: dict = {}
    if pension:
        out["pension"] = float(pension["value"])
        out["pensionName"] = pension.get("name") or "Pensioen"
    if home:
        out["woz"] = float(home["woz"])
        out["mortgage"] = float(home["mortgage"])
        out["equity"] = out["woz"] - out["mortgage"]
        if home.get("note"):
            out["mortgageNote"] = home["note"]
    return out
