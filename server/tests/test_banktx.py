from datetime import date

import pytest
from fastapi.testclient import TestClient

from meridian import api, auth, banktx
from meridian.sources import rabocsv

HEAD = '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Omschrijving-1","Omschrijving-2"'
PAY, SAVE = "NL02RABO0100000002", "NL01RABO0300000001"
T212_INVEST, T212_CARD = "LT123500010001234567", "LT983250012345678901"


def row(seq, d, amount, counter_iban, name, descr="", iban=PAY, saldo="+1000,00"):
    return f'"{iban}","EUR","RABONL2U","{seq:018d}","{d}","{d}","{amount}","{saldo}","{counter_iban}","{name}","{descr}",""'


CSV = "\n".join([
    HEAD,
    row(1, "2026-09-25", "+2500,00", "NL11INGB0001234567", "Werkgever BV", "Salaris"),
    row(2, "2026-09-26", "-400,00", T212_INVEST, "Trading 212 Markets Ltd", "Deposit"),
    row(3, "2026-09-26", "-200,00", "LT000000000000000001", "Clear Junction", "OKX deposit ref 123"),
    row(4, "2026-09-27", "-60,00", T212_CARD, "Trading 212 Markets Ltd", "Top-up card"),
    row(5, "2026-09-28", "-300,00", SAVE, "J. Jansen", "Sparen"),
    row(6, "2026-10-02", "-45,10", "NL22ABNA0000000001", "Albert Heijn", "Boodschappen"),
    row(7, "2026-10-05", "+50,00", T212_INVEST, "Trading 212 Markets Ltd", "Withdrawal"),
    row(1, "2026-09-28", "+300,00", PAY, "J. Jansen", "Sparen", iban=SAVE, saldo="+12300,00"),
])


def test_parse_transactions():
    txs = rabocsv.transactions(CSV)
    assert len(txs) == 8
    assert txs[2] == {"iban": PAY, "seq": 3, "date": "2026-09-26", "amount": -200.0, "counter_iban": "LT000000000000000001",
                      "counter_name": "Clear Junction", "descr": "OKX deposit ref 123"}


def test_no_duplicates(store):
    assert store.add_bank_tx(rabocsv.transactions(CSV)) == 8
    assert store.add_bank_tx(rabocsv.transactions(CSV)) == 0


def test_categories_and_rules(store):
    rabocsv.save(store, rabocsv.parse(CSV))
    store.add_bank_tx(rabocsv.transactions(CSV))
    own = banktx.own_ibans(store)
    cats = [banktx.categorize(t, own, []) for t in store.bank_tx()]
    # salaris, T212, OKX (via omschrijving), T212-kaart (nog als inleg), sparen ×2, AH, T212 terug
    assert sorted(cats) == sorted(["in", "t212", "okx", "t212", "eigen", "eigen", "uit", "t212"])
    banktx.add_rule(store, T212_CARD, "abo")
    s = banktx.summary(store, today=date(2026, 10, 28))
    assert s["invested"] == {"t212": 350.0, "okx": 200.0, "abo": 60.0}  # 400 − 50 teruggestort
    sep = next(m for m in s["months"] if m["month"] == "2026-09")
    assert sep["t212"] == 400 and sep["abo"] == 60 and sep["in"] == 2500 and sep["eigen"] == 0
    assert [m["month"] for m in s["months"]] == ["2026-10", "2026-09"] and s["since"] == "2026-09-25"
    with pytest.raises(ValueError):
        banktx.add_rule(store, "x", "onzin")
    banktx.add_rule(store, "Albert Heijn", "abo")  # tekstregel (op naam)
    assert banktx.rules(store)[-1] == {"match": "albert heijn", "cat": "abo"}
    assert banktx.remove_rule(store, 1) == [{"match": T212_CARD, "cat": "abo"}]


def test_counterparties(store):
    store.add_bank_tx(rabocsv.transactions(CSV))
    top = banktx.counterparties(store, today=date(2026, 10, 28))
    t212 = next(r for r in top if r["iban"] == T212_INVEST)
    assert t212["count"] == 2 and t212["total"] == -350.0 and t212["cat"] == "t212"


def test_api(store, monkeypatch):
    monkeypatch.setitem(api.state, "store", store)
    with TestClient(api.app) as c:
        token = c.post("/api/koppel", json={"code": auth.new_pair_code(store)}).json()["token"]
        h = {"Authorization": f"Bearer {token}"}
        r = c.post("/api/bank/csv", headers=h, json={"text": CSV}).json()
        assert r["newTransactions"] == 8 and r["found"] == 2
        assert c.post("/api/bank/csv", headers=h, json={"text": CSV}).json()["newTransactions"] == 0
        assert c.post("/api/bank/regels", headers=h, json={"match": T212_CARD, "cat": "abo"}).status_code == 200
        assert c.post("/api/bank/regels", headers=h, json={"match": "x", "cat": "nee"}).status_code == 400
        s = c.get("/api/bank/overzicht", headers=h).json()
        assert s["invested"]["abo"] == 60 and s["rules"][0]["cat"] == "abo" and s["count"] == 8
