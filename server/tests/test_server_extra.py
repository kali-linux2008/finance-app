from datetime import datetime

from meridian import config, digest, notify, plans, returns, trading
from meridian.sources import rabocsv

PLAN = {"active": True, "day": 25, "lines": [{"posId": "t212-VWCEd_EQ", "amount": 375}]}


def at(m, d, h=10):
    return datetime(2026, m, d, h, 0, tzinfo=config.TZ)


async def test_precheck_warns_day_before(store, monkeypatch):
    store.set_setting("plan", PLAN)
    store.set_setting("plan.enabled", True)
    store.set_secret("t212.handel", {"key": "K", "secret": "S", "demo": True})
    cash = {"v": 200.0}

    async def account(client, secret, symbol):
        return 0, cash["v"]

    monkeypatch.setattr(trading, "_t212_account", account)
    assert await plans.precheck(store, None, at(11, 24, 8)) is None  # nog geen 09:00
    assert await plans.precheck(store, None, at(11, 23)) is None  # te vroeg (inleg is 25 nov, woensdag)
    e = await plans.precheck(store, None, at(11, 24))
    assert e["title"] == "Inleg morgen: te weinig saldo" and "€ 175,00" in e["body"] and e["kind"] == "warning"
    assert await plans.precheck(store, None, at(11, 24, 15)) is None  # één keer
    cash["v"] = 500.0
    assert await plans.precheck(store, None, at(12, 24)) is None  # genoeg: geen melding
    store.set_setting("plan.enabled", False)
    store.set_setting("plan.prechecked", None)
    assert await plans.precheck(store, None, at(11, 24)) is None


def test_big_moves_once_per_day(store):
    pos = [{"id": "t212-RHMd_EQ", "tk": "RHM", "name": "Rheinmetall", "cat": "eq", "value": 330.0, "dayChange": -6.2},
           {"id": "btc", "tk": "BTC", "name": "Bitcoin", "cat": "cr", "value": 1300.0, "dayChange": 2.0},
           {"id": "rabo", "tk": "RABO", "name": "Spaar", "cat": "cash", "value": 9, "dayChange": 50}]
    sent = digest.moves(store, pos, at(11, 3, 15))
    assert [e["title"] for e in sent] == ["RHM −6,2% vandaag"]
    assert sent[0]["body"] == "Rheinmetall daalt 6,2% vandaag. Waarde nu € 330."
    assert digest.moves(store, pos, at(11, 3, 16)) == []
    assert len(digest.moves(store, pos, at(11, 4, 15))) == 1  # nieuwe dag
    digest.set_types(store, {"price": False})
    assert digest.moves(store, pos, at(11, 5, 15)) == []


def test_returns_per_broker(store):
    csv = "\n".join([
        '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Omschrijving-1"',
        '"NL02RABO0100000002","EUR","X","000000000000000001","2026-09-26","2026-09-26","-400,00","+1000,00","LT1","Trading 212 Markets Ltd",""',
        '"NL02RABO0100000002","EUR","X","000000000000000002","2026-09-27","2026-09-27","-200,00","+800,00","LT2","OKX Europe",""',
    ])
    store.add_bank_tx(rabocsv.transactions(csv))
    returns.set_start(store, "t212", 5000)
    pos = [{"id": "t212-VWCEd_EQ", "tk": "VWCE", "cat": "eq", "value": 5800.0},
           {"id": "t212-cash", "tk": "EUR", "cat": "cash", "value": 100.0},
           {"id": "btc", "tk": "BTC", "cat": "cr", "value": 1500.0, "wallets": [{"name": "Trezor Safe 5", "value": 1300}, {"name": "OKX", "value": 200}]},
           {"id": "okx-XRP", "tk": "XRP", "cat": "cr", "value": 15.0}]
    r = returns.compute(store, pos)
    t212, okx = r["brokers"]
    assert (t212["value"], t212["invested"], t212["gain"], t212["pct"]) == (5900.0, 5400.0, 500.0, 9.3)
    assert (okx["value"], okx["invested"], okx["gain"]) == (215.0, 200.0, 15.0)
    assert r["gain"] == 515.0 and r["since"] == "2026-09-26"
    assert notify.events(store) == []
