"""Handelen via Trading 212 (aandelen/ETF's) en OKX (crypto). In deze versie alleen met oefengeld.

Veiligheid in het kort:
- Handelssleutels staan los van de leessleutels (bronnen `t212.handel` en `okx.handel`).
- Echt geld kan nog niet: LIVE_ALLOWED staat uit en de server weigert sleutels die niet demo zijn.
- Elke order gaat langs dezelfde controles: minimaal € 1, een dagmaximum, verkopen niet meer
  dan er staat en kopen niet meer dan het vrije saldo.
- Elke poging komt in het orderlogboek, ook als hij mislukt. Een order met dezelfde
  request-id wordt nooit twee keer verstuurd (bijv. als de app een verzoek herhaalt).
"""

import asyncio
import math
import re
import time
from dataclasses import dataclass

import httpx

from . import portfolio, prices
from .sources import okx, trading212
from .store import Store

LIVE_ALLOWED = False  # echt geld: pas in een latere stap, bewust aan te zetten
MIN_EUR = 1.0
DEFAULT_DAY_MAX = 250.0
MAX_LIMIT_PCT = 20.0

NAMES = {"t212": "Trading 212", "okx": "OKX"}
SECRET_IDS = {"t212": "t212.handel", "okx": "okx.handel"}
FEE = {"t212": 0.0, "okx": 0.001}  # geschat: OKX rekent ± 0,10%; Trading 212 geen commissie
FX_FEE = 0.0015  # Trading 212: 0,15% bij een aandeel in een andere valuta
CLI = {"t212": "trading212-handel", "okx": "okx-handel"}

_lock = asyncio.Lock()


class TradeError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class Product:
    """Iets wat je kunt kopen of verkopen, afgeleid van een positie in je portefeuille."""
    broker: str
    pos_id: str
    tk: str
    name: str
    symbol: str  # Trading 212-ticker (bijv. VWCEd_EQ) of OKX-munt (bijv. BTC)
    cur: str  # valuta van de koers
    price: float  # koers in `cur`
    eur_per_unit: float  # wat één stuk/munt in euro waard is
    unit: str


def product_from(p: dict) -> Product | None:
    qty, value, price = p.get("qty") or 0, p.get("value") or 0, p.get("price") or 0
    if p["id"].startswith("t212-") and p.get("cat") == "eq" and price:
        eur = value / qty if qty else price
        return Product("t212", p["id"], p["tk"], p["name"], p["id"][5:], p.get("cur") or "EUR", price, eur, "st")
    if p.get("cat") == "cr" and price:
        return Product("okx", p["id"], p["tk"], p["name"], p["tk"], "EUR", price, price, p.get("unit") or p["tk"])
    return None


async def find_product(store: Store, client: httpx.AsyncClient, pos_id: str) -> Product:
    data = await portfolio.build(store, client)
    pos = next((p for p in data["positions"] if p["id"] == pos_id), None)
    prod = product_from(pos) if pos else None
    if not prod:
        raise TradeError("Deze belegging kun je niet via de app verhandelen.", 404)
    return prod


def trade_secret(store: Store, broker: str) -> dict:
    secret = store.get_secret(SECRET_IDS[broker])
    if not secret:
        raise TradeError(f"Nog geen handelssleutel voor {NAMES[broker]}. Voeg die op de server toe met: "
                         f"python -m meridian bron {CLI[broker]}", 409)
    if not secret.get("demo") and not LIVE_ALLOWED:
        raise TradeError("Handelen met echt geld staat uit. In deze versie kan alleen het oefenaccount.", 403)
    return secret


def connected(store: Store) -> dict[str, bool]:
    return {b: bool(store.get_secret(sid)) for b, sid in SECRET_IDS.items()}


def day_max(store: Store) -> float:
    return float(store.get_setting("trade.daymax", DEFAULT_DAY_MAX))


def used_today(store: Store) -> float:
    return store.traded_since(portfolio.start_of_day(time.time()))


def floor_to(x: float, step: float) -> float:
    """Naar beneden afronden op een stapgrootte (bijv. 0,00001 BTC), zonder zwevendekommafoutjes."""
    if step <= 0:
        return x
    decimals = max(0, -int(math.floor(math.log10(step)))) if step < 1 else 0
    return round(math.floor(round(x / step, 9)) * step, decimals)


def round_to(x: float, step: float) -> float:
    decimals = max(0, -int(math.floor(math.log10(step)))) if step < 1 else 0
    return round(round(x / step) * step, decimals)


# ---------------------------------------------------------------- Trading 212

def _t212(secret: dict) -> tuple[str, dict]:
    base = trading212.DEMO if secret.get("demo") else trading212.LIVE
    return base, trading212.auth_header(secret["key"], secret.get("secret"))


async def _t212_account(client: httpx.AsyncClient, secret: dict, symbol: str) -> tuple[float, float]:
    """(stuks van dit instrument, vrij saldo in euro) op het handelsaccount."""
    base, headers = _t212(secret)
    try:
        rows = await trading212.request(client, base, "GET", "/equity/positions", headers)
        qty = sum(float(r.get("quantity") or 0) for r in rows if (r.get("instrument") or {}).get("ticker") == symbol)
    except trading212.T212NotFound:
        rows = await trading212.request(client, base, "GET", "/equity/portfolio", headers)
        qty = sum(float(r.get("quantity") or 0) for r in rows if r.get("ticker") == symbol)
    try:
        s = await trading212.request(client, base, "GET", "/equity/account/summary", headers)
        cash = float((s.get("cash") or {}).get("availableToTrade") or 0)
    except trading212.T212NotFound:
        c = await trading212.request(client, base, "GET", "/equity/account/cash", headers)
        cash = float(c.get("free") or 0)
    return qty, cash


async def _t212_place(client: httpx.AsyncClient, secret: dict, symbol: str, qty: float, limit: float | None) -> dict:
    """Plaatst een order; probeert minder decimalen als Trading 212 de precisie weigert (dan is er niets geplaatst)."""
    base, headers = _t212(secret)
    last: Exception | None = None
    for decimals in (3, 2, 1, 0):
        q = math.floor(abs(qty) * 10**decimals) / 10**decimals
        if q <= 0:
            break
        q = math.copysign(q, qty)
        if limit is None:
            path, body = "/equity/orders/market", {"ticker": symbol, "quantity": q, "extendedHours": False}
        else:
            path, body = "/equity/orders/limit", {"ticker": symbol, "quantity": q, "limitPrice": round(limit, 2),
                                                   "timeValidity": "GOOD_TILL_CANCEL"}
        try:
            row = await trading212.request(client, base, "POST", path, headers, body) or {}
            return {"id": str(row.get("id", "")), "qty": abs(q), "status": row.get("status") or "NEW"}
        except trading212.T212Error as e:
            if "precision" not in str(e).lower():
                raise
            last = e
    raise TradeError(f"Trading 212 accepteert dit aantal niet: {last or 'te klein'}. Kies een groter bedrag.")


def _t212_order(row: dict) -> dict:
    ticker = row.get("ticker") or (row.get("instrument") or {}).get("ticker", "")
    qty = float(row.get("quantity") or 0)
    side = str(row.get("side") or ("SELL" if qty < 0 else "BUY")).upper()
    kind = str(row.get("type") or "").upper()
    return {
        "id": f"t212:{row.get('id')}", "broker": "t212", "symbol": ticker, "tk": trading212.short_ticker(ticker),
        "side": "verkopen" if side == "SELL" else "kopen", "type": "limiet" if kind == "LIMIT" else "markt",
        "qty": abs(qty), "filled": abs(float(row.get("filledQuantity") or 0)),
        "limit": float(row["limitPrice"]) if row.get("limitPrice") is not None else None,
        "status": str(row.get("status") or ""), "created": row.get("creationTime") or row.get("createdAt"),
    }


# ---------------------------------------------------------------- OKX

_pairs: dict[tuple[str, bool, str], dict] = {}


async def _okx_pair(client: httpx.AsyncClient, secret: dict, ccy: str) -> dict:
    """Het handelspaar voor een munt: liefst tegen euro, anders tegen USDT (bij demo vaak de enige)."""
    key = (secret.get("domain", ""), bool(secret.get("demo")), ccy)
    if key in _pairs:
        return _pairs[key]
    for quote in ("EUR", "USDT"):
        try:
            rows = await okx.request(client, secret, "GET", "/api/v5/public/instruments",
                                     {"instType": "SPOT", "instId": f"{ccy}-{quote}"})
        except okx.OkxError:
            continue
        if rows and rows[0].get("state", "live") == "live":
            r = rows[0]
            pair = {"instId": r["instId"], "quote": quote, "lotSz": float(r.get("lotSz") or 1e-8),
                    "minSz": float(r.get("minSz") or 0), "tickSz": float(r.get("tickSz") or 0.01)}
            _pairs[key] = pair
            return pair
    raise TradeError(f"OKX heeft geen handelspaar voor {ccy} tegen euro of USDT.")


async def _quote_eur(client: httpx.AsyncClient, quote: str) -> float:
    if quote == "EUR":
        return 1.0
    return (await prices.eur_price(client, quote))[0]


async def _okx_last(client: httpx.AsyncClient, secret: dict, inst: str) -> float:
    rows = await okx.request(client, secret, "GET", "/api/v5/market/ticker", {"instId": inst})
    if not rows:
        raise TradeError(f"Geen koers voor {inst} bij OKX.")
    return float(rows[0]["last"])


async def _okx_account(client: httpx.AsyncClient, secret: dict, ccy: str, quote: str) -> tuple[float, float]:
    """(beschikbare munten, beschikbaar saldo in de quote-valuta) op het handelsaccount."""
    avail: dict[str, float] = {}
    for acc in await okx.request(client, secret, "GET", "/api/v5/account/balance", {"ccy": f"{ccy},{quote}"}):
        for d in acc.get("details") or []:
            avail[d["ccy"]] = float(d.get("availBal") or d.get("cashBal") or 0)
    return avail.get(ccy, 0.0), avail.get(quote, 0.0)


def _okx_order(row: dict) -> dict:
    base = row.get("instId", "").split("-")[0]
    qty = float(row.get("sz") or 0)
    px = float(row["px"]) if row.get("px") else None
    if row.get("tgtCcy") == "quote_ccy" and px:
        qty = qty / px
    return {
        "id": f"okx:{row.get('instId')}:{row.get('ordId')}", "broker": "okx", "symbol": row.get("instId"), "tk": base,
        "side": "verkopen" if row.get("side") == "sell" else "kopen",
        "type": "limiet" if row.get("ordType") in ("limit", "post_only") else "markt",
        "qty": qty, "filled": float(row.get("accFillSz") or 0), "limit": px,
        "cur": row.get("instId", "-EUR").split("-")[1], "status": row.get("state", ""),
        "created": int(row["cTime"]) / 1000 if row.get("cTime") else None,
    }


# ---------------------------------------------------------------- voor de app

async def quote(store: Store, client: httpx.AsyncClient, pos_id: str) -> dict:
    """Alles wat het handelsscherm nodig heeft: koers, wat je kunt verkopen, vrij saldo, kosten, limieten."""
    prod = await find_product(store, client, pos_id)
    out = {
        "posId": prod.pos_id, "broker": prod.broker, "brokerName": NAMES[prod.broker], "tk": prod.tk, "name": prod.name,
        "unit": prod.unit, "cur": prod.cur, "price": prod.price, "eurPerUnit": prod.eur_per_unit,
        "fee": FEE[prod.broker], "fx": FX_FEE if prod.broker == "t212" and prod.cur != "EUR" else 0.0,
        "exec": "Direct · 24/7" if prod.broker == "okx" else "Tijdens openingstijden van de beurs",
        "dayMax": day_max(store), "usedToday": round(used_today(store), 2), "minAmount": MIN_EUR,
        "connected": False, "demo": True, "sellMax": 0.0, "sellQty": 0.0, "cash": None, "error": None,
    }
    secret = store.get_secret(SECRET_IDS[prod.broker])
    if not secret:
        out["error"] = f"Nog geen handelssleutel voor {NAMES[prod.broker]} op de server."
        return out
    out["connected"], out["demo"] = True, bool(secret.get("demo"))
    try:
        if prod.broker == "t212":
            qty, cash = await _t212_account(client, secret, prod.symbol)
            out.update(sellQty=qty, sellMax=round(qty * prod.eur_per_unit, 2), cash=round(cash, 2))
        else:
            pair = await _okx_pair(client, secret, prod.symbol)
            rate = await _quote_eur(client, pair["quote"])
            last = await _okx_last(client, secret, pair["instId"])
            qty, cash = await _okx_account(client, secret, prod.symbol, pair["quote"])
            out.update(price=round(last * rate, 8), eurPerUnit=round(last * rate, 8), pair=pair["instId"],
                       sellQty=qty, sellMax=round(qty * last * rate, 2), cash=round(cash * rate, 2))
    except (TradeError, trading212.T212Error, okx.OkxError, prices.PriceError, httpx.HTTPError) as e:
        out["error"] = _describe(e)
    return out


@dataclass
class OrderRequest:
    pos_id: str
    side: str  # "kopen" of "verkopen"
    amount: float  # euro
    type: str  # "markt" of "limiet"
    limit_pct: float  # limiet t.o.v. de koers nu, in procent
    request_id: str


async def place(store: Store, client: httpx.AsyncClient, req: OrderRequest) -> dict:
    async with _lock:  # één order tegelijk, zodat het dagmaximum klopt
        if req.request_id and (prev := store.order_by_request(req.request_id)):
            return _result(prev)
        prod = await find_product(store, client, req.pos_id)
        secret = trade_secret(store, prod.broker)
        log = {"request_id": req.request_id or None, "broker": prod.broker, "demo": int(bool(secret.get("demo"))),
               "action": req.side, "symbol": prod.symbol, "kind": req.type, "amount": round(req.amount, 2)}
        try:
            _validate(store, req)
            placed = await (_place_t212 if prod.broker == "t212" else _place_okx)(client, secret, prod, req)
        except (TradeError, trading212.T212Error, okx.OkxError, prices.PriceError, httpx.HTTPError) as e:
            row = store.log_order(**log, ok=0, message=_describe(e))
            raise TradeError(row["message"], getattr(e, "status", 400)) from e
        row = store.log_order(**log, ok=1, qty=placed["qty"], price=placed.get("limit"), broker_id=placed["id"],
                              message=placed.get("status"))
        return _result(row)


def _validate(store: Store, req: OrderRequest) -> None:
    if req.side not in ("kopen", "verkopen") or req.type not in ("markt", "limiet"):
        raise TradeError("Onbekend soort order.")
    if not math.isfinite(req.amount) or req.amount < MIN_EUR:
        raise TradeError("Minimaal € 1.")
    if req.type == "limiet" and not (-MAX_LIMIT_PCT <= req.limit_pct <= MAX_LIMIT_PCT):
        raise TradeError(f"Een limiet mag hooguit {MAX_LIMIT_PCT:g}% van de koers afwijken.")
    left = day_max(store) - used_today(store)
    if req.amount > left + 0.005:
        raise TradeError(f"Dagmaximum bereikt: je kunt vandaag nog voor {_eur(max(left, 0))} handelen. "
                         "Aanpassen op de server: python -m meridian handel maximum <bedrag>")


async def _place_t212(client: httpx.AsyncClient, secret: dict, prod: Product, req: OrderRequest) -> dict:
    held, cash = await _t212_account(client, secret, prod.symbol)
    factor = 1 + (req.limit_pct / 100 if req.type == "limiet" else 0)
    per_unit = prod.eur_per_unit * factor
    if req.side == "kopen":
        if req.amount > cash + 0.005:
            raise TradeError(f"Niet genoeg vrij saldo: {_eur(cash)} beschikbaar.")
        qty = req.amount / per_unit
    else:
        have = held * prod.eur_per_unit
        if req.amount > have + 0.005:
            raise TradeError(f"Je kunt hooguit {_eur(have)} verkopen.")
        qty = held if req.amount >= have * 0.99 else req.amount / per_unit  # (bijna) alles: alles verkopen
        qty = -qty
    limit = prod.price * factor if req.type == "limiet" else None
    res = await _t212_place(client, secret, prod.symbol, qty, limit)
    return {**res, "limit": limit}


async def _place_okx(client: httpx.AsyncClient, secret: dict, prod: Product, req: OrderRequest) -> dict:
    pair = await _okx_pair(client, secret, prod.symbol)
    rate = await _quote_eur(client, pair["quote"])
    last = await _okx_last(client, secret, pair["instId"])
    held, cash = await _okx_account(client, secret, prod.symbol, pair["quote"])
    amount_q = req.amount / rate  # bedrag in de quote-valuta (EUR of USDT)
    body = {"instId": pair["instId"], "tdMode": "cash", "side": "buy" if req.side == "kopen" else "sell",
            "clOrdId": re.sub(r"[^A-Za-z0-9]", "", req.request_id)[:32] or None}
    if req.side == "kopen" and amount_q > cash + 0.005:
        raise TradeError(f"Niet genoeg vrij saldo op OKX: {_eur(cash * rate)} beschikbaar.")
    if req.side == "verkopen" and req.amount > held * last * rate + 0.005:
        raise TradeError(f"Je kunt hooguit {_eur(held * last * rate)} verkopen (alleen wat op OKX staat).")

    limit = None
    if req.type == "markt" and req.side == "kopen":
        qty = amount_q / last
        body.update(ordType="market", sz=f"{amount_q:.2f}", tgtCcy="quote_ccy")
    else:
        px = round_to(last * (1 + req.limit_pct / 100), pair["tickSz"]) if req.type == "limiet" else last
        qty = amount_q / px
        if req.side == "verkopen" and req.amount >= held * last * rate * 0.99:
            qty = held
        qty = floor_to(qty, pair["lotSz"])
        if qty < pair["minSz"] or qty <= 0:
            raise TradeError(f"Te klein voor OKX: minimaal {pair['minSz']:g} {prod.symbol}.")
        body.update(ordType="market" if req.type == "markt" else "limit", sz=f"{qty:.10f}".rstrip("0").rstrip("."))
        if req.type == "limiet":
            body["px"] = f"{px:.10f}".rstrip("0").rstrip(".")
            limit = px
    body = {k: v for k, v in body.items() if v is not None}
    rows = await okx.request(client, secret, "POST", "/api/v5/trade/order", body=body)
    row = rows[0] if rows else {}
    return {"id": f"{pair['instId']}:{row.get('ordId', '')}", "qty": qty, "limit": limit, "status": "geplaatst"}


def _result(row: dict) -> dict:
    return {"ok": bool(row["ok"]), "demo": bool(row["demo"]), "broker": row["broker"], "brokerName": NAMES[row["broker"]],
            "orderId": row.get("broker_id"), "qty": row.get("qty"), "limit": row.get("price"),
            "message": row.get("message"), "at": row["ts"]}


async def open_orders(store: Store, client: httpx.AsyncClient) -> dict:
    orders, brokers = [], []
    for broker, sid in SECRET_IDS.items():
        secret = store.get_secret(sid)
        info = {"id": broker, "name": NAMES[broker], "connected": bool(secret), "demo": bool(secret and secret.get("demo")),
                "error": None}
        brokers.append(info)
        if not secret:
            continue
        try:
            if broker == "t212":
                base, headers = _t212(secret)
                rows = await trading212.request(client, base, "GET", "/equity/orders", headers) or []
                orders += [_t212_order(r) for r in rows]
            else:
                rows = await okx.request(client, secret, "GET", "/api/v5/trade/orders-pending", {"instType": "SPOT"})
                orders += [_okx_order(r) for r in rows]
        except (trading212.T212Error, okx.OkxError, httpx.HTTPError) as e:
            info["error"] = _describe(e)
    return {"orders": orders, "brokers": brokers}


def _split(order_id: str) -> tuple[str, list[str]]:
    broker, _, rest = order_id.partition(":")
    if broker not in SECRET_IDS or not rest:
        raise TradeError("Onbekende order.")
    return broker, rest.split(":")


async def cancel(store: Store, client: httpx.AsyncClient, order_id: str) -> dict:
    broker, parts = _split(order_id)
    secret = trade_secret(store, broker)
    log = {"broker": broker, "demo": int(bool(secret.get("demo"))), "action": "annuleren", "broker_id": order_id}
    try:
        if broker == "t212":
            base, headers = _t212(secret)
            await trading212.request(client, base, "DELETE", f"/equity/orders/{int(parts[0])}", headers)
            symbol = parts[0]
        else:
            inst, ord_id = parts
            await okx.request(client, secret, "POST", "/api/v5/trade/cancel-order", body={"instId": inst, "ordId": ord_id})
            symbol = inst
    except (ValueError, trading212.T212Error, okx.OkxError, httpx.HTTPError) as e:
        store.log_order(**log, symbol=order_id, ok=0, message=_describe(e))
        raise TradeError(_describe(e)) from e
    store.log_order(**log, symbol=symbol, ok=1)
    return {"ok": True}


async def amend(store: Store, client: httpx.AsyncClient, order_id: str, limit: float) -> dict:
    """Limiet wijzigen. OKX kan dat direct; bij Trading 212 annuleren we en plaatsen we hem opnieuw."""
    if not math.isfinite(limit) or limit <= 0:
        raise TradeError("Ongeldige limiet.")
    broker, parts = _split(order_id)
    secret = trade_secret(store, broker)
    log = {"broker": broker, "demo": int(bool(secret.get("demo"))), "action": "wijzigen", "price": limit}
    try:
        if broker == "okx":
            inst, ord_id = parts
            await okx.request(client, secret, "POST", "/api/v5/trade/amend-order",
                              body={"instId": inst, "ordId": ord_id, "newPx": f"{limit:.10f}".rstrip("0").rstrip(".")})
            new_id = order_id
            symbol = inst
        else:
            current = next((o for o in (await open_orders(store, client))["orders"] if o["id"] == order_id), None)
            if not current or current["type"] != "limiet":
                raise TradeError("Deze order staat niet (meer) open.")
            left = current["qty"] - current["filled"]
            base, headers = _t212(secret)
            await trading212.request(client, base, "DELETE", f"/equity/orders/{int(parts[0])}", headers)
            qty = -left if current["side"] == "verkopen" else left
            res = await _t212_place(client, secret, current["symbol"], qty, limit)
            new_id, symbol = f"t212:{res['id']}", current["symbol"]
    except (TradeError, ValueError, trading212.T212Error, okx.OkxError, httpx.HTTPError) as e:
        store.log_order(**log, symbol=order_id, ok=0, message=_describe(e))
        raise TradeError(_describe(e)) from e
    store.log_order(**log, symbol=symbol, ok=1, broker_id=new_id)
    return {"ok": True, "id": new_id}


def _eur(v: float) -> str:
    return "€ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _describe(e: Exception) -> str:
    text = str(e).strip()
    if isinstance(e, httpx.TimeoutException):
        return "De broker reageert te traag. Kijk in de app van de broker of de order toch is geplaatst."
    if isinstance(e, httpx.HTTPError):
        return f"Geen verbinding met de broker ({e.__class__.__name__})."
    return text or e.__class__.__name__
