from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient

from meridian import api, auth, config, notify, portfolio, reminders
from meridian.sources import rabocsv

HEAD = '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Omschrijving-1"'
CSV = "\n".join([
    HEAD,
    '"NL01RABO0300000001","EUR","RABONL2U","000000000000000041","2026-10-20","2026-10-20","+100,00","+12400,00","NL02RABO0100000002","J. Jansen","Sparen"',
    '"NL01RABO0300000001","EUR","RABONL2U","000000000000000042","2026-10-25","2026-10-25","+250,50","+12650,50","NL02RABO0100000002","J. Jansen","Sparen"',
    '"NL02RABO0100000002","EUR","RABONL2U","000000000000000107","2026-10-25","2026-10-25","-250,50","+1.234,56","NL01RABO0300000001","J. Jansen","Sparen"',
    '"NL02RABO0100000002","EUR","RABONL2U","000000000000000106","2026-10-25","2026-10-25","-10,00","+1485,06","","Albert Heijn",""',
])


def test_parse_takes_latest_balance_per_account():
    got = rabocsv.parse(CSV)
    assert got == {
        "NL01RABO0300000001": {"balance": 12650.5, "date": "2026-10-25", "cur": "EUR"},
        "NL02RABO0100000002": {"balance": 1234.56, "date": "2026-10-25", "cur": "EUR"},  # hoogste volgnummer
    }
    assert rabocsv.parse(rabocsv.decode(("﻿" + CSV).encode("utf-8"))) == got
    assert rabocsv.parse(rabocsv.decode(CSV.replace("Jansen", "Müller").encode("cp1252"))) == got
    with pytest.raises(rabocsv.CsvError, match="geen CSV"):
        rabocsv.parse("datum;bedrag\n1;2")
    with pytest.raises(rabocsv.CsvError, match="Geen saldo"):
        rabocsv.parse(HEAD)


def test_older_file_does_not_overwrite(store):
    rabocsv.save(store, rabocsv.parse(CSV))
    old = {"NL01RABO0300000001": {"balance": 1.0, "date": "2026-09-01", "cur": "EUR"}}
    rabocsv.save(store, old)
    assert rabocsv.state(store)["accounts"]["NL01RABO0300000001"]["balance"] == 12650.5


async def test_portfolio_uses_csv_but_not_twice(store):
    store.set_setting("manual", {"banks": [{"bank": "Rabobank", "name": "Spaar", "kind": "spaar", "value": 100}]})
    rabocsv.save(store, rabocsv.parse(CSV))
    p = await portfolio.build(store, None)
    assert sorted(x["name"] for x in p["positions"]) == ["Spaarrekening ·0001", "Spaarrekening ·0002"]  # handmatig weg
    store.set_secret("rabobank", {"app_id": "x", "accounts": [{"uid": "u", "iban": "NL02RABO0100000002"}]})
    res = rabocsv.source(store, {"NL02RABO0100000002"}, today=date(2026, 10, 28))
    assert [x.name for x in res.positions] == ["Spaarrekening ·0001"] and not res.warnings  # betaal komt via koppeling
    assert rabocsv.source(store, set(), today=date(2027, 1, 1)).warnings


def test_weekly_reminder(store):
    sunday = datetime(2026, 11, 1, 10, 5, tzinfo=config.TZ)
    assert not reminders.due(store, sunday.replace(hour=9))
    assert reminders.due(store, sunday)
    assert not reminders.due(store, sunday.replace(hour=11))  # één keer per week
    assert not reminders.due(store, datetime(2026, 11, 2, 10, 5, tzinfo=config.TZ))  # maandag
    rabocsv.save(store, rabocsv.parse(CSV), now=datetime(2026, 11, 7, 12, tzinfo=config.TZ).timestamp())
    assert not reminders.due(store, datetime(2026, 11, 8, 10, 5, tzinfo=config.TZ))  # net gestuurd: overslaan
    assert reminders.due(store, datetime(2026, 11, 15, 10, 5, tzinfo=config.TZ))
    store.set_setting(reminders.KEY, {"on": True, "day": 2, "hour": 19})
    assert reminders.describe(store) == "elke wo om 19:00"
    store.set_setting(reminders.KEY, {"on": False})
    assert reminders.describe(store) == "uit" and not reminders.due(store, datetime(2026, 11, 22, 10, 5, tzinfo=config.TZ))


def test_api_csv(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        assert c.post("/api/bank/csv", json={"text": CSV}).status_code == 401
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        assert c.get("/api/bank/csv", headers=h).json()["accounts"] == []
        r = c.post("/api/bank/csv", headers=h, json={"text": "geen csv"})
        assert r.status_code == 400 and "Rabobank" in r.json()["detail"]
        r = c.post("/api/bank/csv", headers=h, json={"text": CSV}).json()
        assert r["found"] == 2 and r["accounts"][0] == {"iban": "…0001", "balance": 12650.5, "date": "2026-10-25"}
        assert r["reminder"] == "elke zo om 10:00" and r["uploaded"]
    assert not [e for e in notify.events(store) if e["kind"] == "csv"]
