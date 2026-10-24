from meridian import auth
from meridian.store import Store


def test_secret_is_encrypted_at_rest(store):
    store.set_secret("okx", {"key": "abc", "secret": "geheim"})
    raw = store._conn.execute("SELECT blob FROM secrets").fetchone()[0]
    assert b"geheim" not in raw
    assert store.get_secret("okx") == {"key": "abc", "secret": "geheim"}
    assert store.sources() == ["okx"]
    store.delete_secret("okx")
    assert store.get_secret("okx") is None


def test_snapshots_at_most_every_10_minutes_and_pruned(store):
    store.add_snapshot(100, ts=1_000_000)
    store.add_snapshot(101, ts=1_000_100)  # te snel, genegeerd
    store.add_snapshot(102, ts=1_000_700)
    assert [v for _, v in store.snapshots(0)] == [100, 102]
    # oude dag met meerdere metingen → alleen de laatste blijft
    store.prune_snapshots(now=1_000_000 + 10 * 86400)
    assert [v for _, v in store.snapshots(0)] == [102]


def test_pairing_flow(store):
    code = auth.new_pair_code(store)
    assert len(code) == 6
    assert auth.redeem_pair_code(store, "000000" if code != "000000" else "111111", "test") is None
    token = auth.redeem_pair_code(store, code, "Pixel")
    assert token and auth.check_token(store, token)
    assert auth.redeem_pair_code(store, code, "nog eens") is None  # eenmalig
    assert not auth.check_token(store, "verkeerd")


def test_pair_code_dies_after_too_many_wrong_attempts(store):
    code = auth.new_pair_code(store)
    wrong = "123456" if code != "123456" else "654321"
    for _ in range(auth.MAX_ATTEMPTS):
        auth.redeem_pair_code(store, wrong, "x")
    assert auth.redeem_pair_code(store, code, "x") is None


def test_cli_strips_arrow_key_codes():
    from meridian.__main__ import clean, parse_amount

    assert clean("Rabobank Betaalrekening\x1b[D\x1b[D ") == "Rabobank Betaalrekening"
    assert parse_amount(clean("1645,98\x1b[C")) == 1645.98


def test_success_line_keeps_source_name(capsys, monkeypatch):
    import asyncio

    from meridian import __main__ as cli
    from meridian.models import SourceResult

    async def fake(client, secret):
        return SourceResult(id="okx", name="OKX")

    monkeypatch.setitem(cli.okx.__dict__, "fetch", fake)
    asyncio.run(cli._test("okx", {}))
    assert "Gelukt: OKX · € 0,00 in 0 posities" in capsys.readouterr().out
    assert cli.eur(1438.92) == "€ 1.438,92"


def test_parallel_requests_do_not_break_the_database(tmp_path):
    # De app vraagt soms twee dingen tegelijk; FastAPI draait die in aparte threads op één verbinding.
    from concurrent.futures import ThreadPoolExecutor

    from cryptography.fernet import Fernet

    s = Store(tmp_path / "db.sqlite", key=Fernet.generate_key().decode())
    token = auth.redeem_pair_code(s, auth.new_pair_code(s), "Pixel")
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(lambda i: (auth.check_token(s, token), s.get_setting("x"), s.set_setting("y", i)), range(400)))
    assert all(r[0] for r in results)
