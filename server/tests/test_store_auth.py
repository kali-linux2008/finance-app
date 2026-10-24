from meridian import auth


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
