import base64
import hashlib
import hmac

import httpx
import pytest
import respx

from meridian.sources import okx, trading212, trezor

OKX = "https://www.okx.com"
T212 = trading212.LIVE


def ticker(last, sod):
    return httpx.Response(200, json={"code": "0", "data": [{"last": str(last), "sodUtc0": str(sod)}]})


NO_TICKER = httpx.Response(200, json={"code": "51001", "msg": "Instrument ID does not exist", "data": []})


# Trading 212

@respx.mock
async def test_t212_positions_cash_and_etf_detection():
    respx.get(f"{T212}/equity/metadata/instruments").respond(json=[
        {"ticker": "VWCEd_EQ", "type": "ETF", "shortName": "VWCE", "currencyCode": "EUR", "name": "Vanguard FTSE All-World"},
        {"ticker": "AAPL_US_EQ", "type": "STOCK", "shortName": "AAPL", "currencyCode": "USD", "name": "Apple"},
    ])
    pos = respx.get(f"{T212}/equity/positions").respond(json=[
        {"instrument": {"ticker": "VWCEd_EQ", "name": "Vanguard FTSE All-World", "currency": "EUR"},
         "quantity": 142.3, "currentPrice": 128.04, "walletImpact": {"currentValue": 18220, "totalCost": 14950}},
        {"instrument": {"ticker": "AAPL_US_EQ", "name": "Apple", "currency": "USD"},
         "quantity": 18, "currentPrice": 245.1, "walletImpact": {"currentValue": 3803, "totalCost": 3120}},
    ])
    respx.get(f"{T212}/equity/account/summary").respond(json={"currency": "EUR", "cash": {"availableToTrade": 50.5, "inPies": 0}})

    async with httpx.AsyncClient() as c:
        res = await trading212.fetch(c, {"key": "K", "secret": "S"})

    sent = pos.calls.last.request.headers["Authorization"]
    assert sent == "Basic " + base64.b64encode(b"K:S").decode()
    by_tk = {p.tk: p for p in res.positions}
    assert by_tk["VWCE"].cls == "ETF" and by_tk["VWCE"].value == 18220 and by_tk["VWCE"].cost == 14950
    assert by_tk["AAPL"].cls == "Aandeel" and by_tk["AAPL"].cur == "USD"
    assert by_tk["T212"].cat == "cash" and by_tk["T212"].value == 50.5
    assert res.value == pytest.approx(18220 + 3803 + 50.5)


@respx.mock
async def test_t212_falls_back_to_old_endpoints_and_reports_bad_key():
    respx.get(f"{trading212.DEMO}/equity/metadata/instruments").respond(json=[])
    respx.get(f"{trading212.DEMO}/equity/positions").respond(404)
    respx.get(f"{trading212.DEMO}/equity/portfolio").respond(json=[
        {"ticker": "ASML_EQ", "quantity": 7, "averagePrice": 630, "currentPrice": 702.8, "ppl": 509.6},
    ])
    respx.get(f"{trading212.DEMO}/equity/account/summary").respond(404)
    respx.get(f"{trading212.DEMO}/equity/account/cash").respond(json={"free": 0, "pieCash": 0})
    async with httpx.AsyncClient() as c:
        res = await trading212.fetch(c, {"key": "K", "demo": True})
    assert res.name == "Trading 212 (demo)"
    assert res.positions[0].tk == "ASML" and res.positions[0].value == pytest.approx(7 * 630 + 509.6)

    respx.get(f"{T212}/equity/metadata/instruments").respond(401)
    respx.get(f"{T212}/equity/positions").respond(401)
    async with httpx.AsyncClient() as c:
        with pytest.raises(trading212.T212Error, match="401"):
            await trading212.fetch(c, {"key": "K", "secret": "S"})


def test_short_ticker():
    assert trading212.short_ticker("AAPL_US_EQ") == "AAPL"
    assert trading212.short_ticker("VWCEd_EQ") == "VWCE"


# OKX

def test_okx_signature_matches_spec():
    expected = base64.b64encode(hmac.new(b"geheim", b"2026-10-24T09:00:00.000ZGET/api/v5/account/balance", hashlib.sha256).digest()).decode()
    assert okx.sign("geheim", "2026-10-24T09:00:00.000Z", "get", "/api/v5/account/balance") == expected


@respx.mock
async def test_okx_balances_valued_in_euro_with_demo_header():
    bal = respx.get(f"{OKX}/api/v5/account/balance").respond(json={"code": "0", "data": [{"details": [
        {"ccy": "BTC", "eq": "0.0377"}, {"ccy": "SOL", "eq": "4.3"}, {"ccy": "SHIB", "eq": "10"},
    ]}]})
    respx.get(f"{OKX}/api/v5/asset/balances").respond(json={"code": "0", "data": [{"ccy": "ETH", "bal": "0.82"}, {"ccy": "EUR", "bal": "25"}]})
    respx.get(f"{OKX}/api/v5/market/ticker", params={"instId": "BTC-EUR"}).mock(return_value=ticker(91810, 92290))
    respx.get(f"{OKX}/api/v5/market/ticker", params={"instId": "ETH-EUR"}).mock(return_value=ticker(2480, 2488))
    respx.get(f"{OKX}/api/v5/market/ticker", params={"instId": "SOL-EUR"}).mock(return_value=NO_TICKER)
    respx.get(f"{OKX}/api/v5/market/ticker", params={"instId": "SOL-USDT"}).mock(return_value=ticker(170, 168))
    respx.get(f"{OKX}/api/v5/market/ticker", params={"instId": "USDT-EUR"}).mock(return_value=ticker(0.85, 0.85))
    respx.get(f"{OKX}/api/v5/market/ticker", params={"instId": "SHIB-EUR"}).mock(return_value=ticker(0.00001, 0.00001))

    async with httpx.AsyncClient() as c:
        res = await okx.fetch(c, {"key": "k", "secret": "s", "passphrase": "p", "demo": True})

    assert bal.calls.last.request.headers["x-simulated-trading"] == "1"
    by = {p.tk: p for p in res.positions}
    assert set(by) == {"BTC", "ETH", "SOL", "EUR"}  # SHIB is stof (< € 1)
    assert by["BTC"].value == pytest.approx(0.0377 * 91810, abs=0.01)
    assert by["SOL"].price == pytest.approx(170 * 0.85)
    assert by["EUR"].cat == "cash"
    assert by["BTC"].dayChange == pytest.approx((91810 - 92290) / 92290 * 100, abs=0.01)


@respx.mock
async def test_okx_error_message_is_readable():
    respx.get(f"{OKX}/api/v5/account/balance").respond(json={"code": "50113", "msg": "Invalid Sign", "data": []})
    async with httpx.AsyncClient() as c:
        with pytest.raises(okx.OkxError, match="Invalid Sign"):
            await okx.fetch(c, {"key": "k", "secret": "s", "passphrase": "p"})


# Trezor

ZPUB = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs"


def test_bip84_addresses_match_test_vectors():
    key, kind = trezor.parse(ZPUB)
    assert kind == "wpkh"
    assert trezor.address(key, kind, 0, 0) == "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"
    assert trezor.address(key, kind, 1, 0) == "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el"


def test_rejects_garbage_and_private_keys():
    with pytest.raises(trezor.TrezorError):
        trezor.parse("hallo")
    with pytest.raises(trezor.TrezorError, match="privésleutel"):
        trezor.parse("xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi")


@respx.mock
async def test_balance_scans_until_gap_limit():
    key, kind = trezor.parse(ZPUB)
    used = {trezor.address(key, kind, 0, 0): 150_000, trezor.address(key, kind, 0, 1): 0, trezor.address(key, kind, 1, 0): 25_000}

    def esplora(request):
        addr = request.url.path.rsplit("/", 1)[-1]
        if addr in used:
            return httpx.Response(200, json={"chain_stats": {"tx_count": 2, "funded_txo_sum": used[addr] + 1000, "spent_txo_sum": 1000}, "mempool_stats": {}})
        return httpx.Response(200, json={"chain_stats": {"tx_count": 0, "funded_txo_sum": 0, "spent_txo_sum": 0}, "mempool_stats": {}})

    route = respx.get(url__startswith="https://mempool.space/api/address/").mock(side_effect=esplora)
    async with httpx.AsyncClient() as c:
        sats = await trezor.balance_sats(c, ZPUB, gap=3)
    assert sats == 175_000
    # ontvangen: 0,1 gebruikt + 3 leeg; wisselgeld: 0 gebruikt + 3 leeg
    assert route.call_count == 5 + 4


@respx.mock
async def test_price_service_down_gives_warning_not_crash():
    from meridian.sources import manual

    respx.get(url__startswith=f"{OKX}/api/v5/market/ticker").mock(side_effect=httpx.ConnectError("geen netwerk"))
    async with httpx.AsyncClient() as c:
        res = await manual.gold_source(c, manual.normalize({"gold_grams": 22, "gold_price": 88.64}))
        assert res.positions[0].value == pytest.approx(22 * 88.64)
        res2 = await manual.gold_source(c, manual.normalize({"gold_grams": 22}))
        assert not res2.positions and res2.warnings


@respx.mock
async def test_okx_finds_eea_region_for_dutch_accounts():
    wrong = {"code": "50119", "msg": "API key doesn't exist", "data": []}
    respx.get("https://eea.okx.com/api/v5/account/balance").respond(json={"code": "0", "data": [{"details": []}]})
    respx.get("https://www.okx.com/api/v5/account/balance").respond(json=wrong)
    async with httpx.AsyncClient() as c:
        assert await okx.find_domain(c, {"key": "k", "secret": "s", "passphrase": "p"}) == "https://eea.okx.com"


@respx.mock
async def test_okx_region_search_stops_on_other_errors_and_uses_saved_domain():
    respx.get("https://eea.okx.com/api/v5/account/balance").respond(json={"code": "50105", "msg": "Invalid OK-ACCESS-PASSPHRASE", "data": []})
    async with httpx.AsyncClient() as c:
        with pytest.raises(okx.OkxError, match="PASSPHRASE"):
            await okx.find_domain(c, {"key": "k", "secret": "s", "passphrase": "fout"})

    for d in okx.DOMAINS:
        respx.get(f"{d}/api/v5/account/balance").respond(json={"code": "50119", "msg": "API key doesn't exist", "data": []})
    async with httpx.AsyncClient() as c:
        with pytest.raises(okx.OkxError, match="geen enkele regio"):
            await okx.find_domain(c, {"key": "k", "secret": "s", "passphrase": "p"})

    route = respx.get("https://eea.okx.com/api/v5/asset/balances").respond(json={"code": "0", "data": []})
    respx.get("https://eea.okx.com/api/v5/account/balance").respond(json={"code": "0", "data": [{"details": []}]})
    async with httpx.AsyncClient() as c:
        res = await okx.fetch(c, {"key": "k", "secret": "s", "passphrase": "p", "domain": "https://eea.okx.com"})
    assert route.called and res.positions == []
