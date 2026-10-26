import base64
import json
import time

import httpx
import pytest
import respx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from meridian import portfolio
from meridian.sources import rabobank

API = rabobank.API
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PEM = KEY.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
APP = {"app_id": "app-123", "key_pem": PEM}


def unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def test_token_is_valid_rs256():
    tok = rabobank.token(APP, now=1000)
    head, body, sig = tok.split(".")
    assert json.loads(unb64(head)) == {"typ": "JWT", "alg": "RS256", "kid": "app-123"}
    assert json.loads(unb64(body)) == {"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": 1000, "exp": 4600}
    KEY.public_key().verify(unb64(sig), f"{head}.{body}".encode(), padding.PKCS1v15(), hashes.SHA256())  # gooit bij fout
    with pytest.raises(rabobank.BankError):
        rabobank.check_key("geen sleutel")


def test_code_from_redirect():
    assert rabobank.code_from("https://localhost/meridian?state=abc&code=XYZ", "abc") == "XYZ"
    with pytest.raises(rabobank.BankError, match="state"):
        rabobank.code_from("https://localhost/meridian?state=nee&code=XYZ", "abc")
    with pytest.raises(rabobank.BankError, match="toestemming"):
        rabobank.code_from("https://localhost/meridian?error=access_denied&error_description=Geweigerd", "abc")
    with pytest.raises(rabobank.BankError, match="Geen code"):
        rabobank.code_from("https://localhost/meridian", None)


def test_pick_balance_prefers_booked():
    bal = lambda t, a: {"balance_type": t, "balance_amount": {"amount": a, "currency": "EUR"}}  # noqa: E731
    assert rabobank.pick_balance([bal("ITAV", "90.00"), bal("CLBD", "100.50")]) == 100.5
    assert rabobank.pick_balance([bal("XYZ", "7")]) == 7
    assert rabobank.pick_balance([]) is None


@respx.mock
async def test_link_and_fetch():
    respx.get(f"{API}/aspsps").respond(json={"aspsps": [
        {"name": "Rabobank Business", "country": "NL"}, {"name": "Rabobank", "country": "NL", "maximum_consent_validity": 15552000}]})
    auth = respx.post(f"{API}/auth").respond(json={"url": "https://bank.example/login"})
    respx.post(f"{API}/sessions").respond(json={"session_id": "s1", "access": {"valid_until": "2099-01-01T00:00:00+00:00"}, "accounts": [
        {"uid": "acc-betaal-0001", "account_id": {"iban": "NL01RABO0123456789"}, "cash_account_type": "CACC", "name": "J. Jansen"},
        {"uid": "acc-spaar-00002", "account_id": {"iban": "NL02RABO0987654321"}, "cash_account_type": "SVGS", "product": "Rabo SpaarRekening"}]})
    respx.get(f"{API}/accounts/acc-betaal-0001/balances").respond(json={"balances": [{"balance_type": "CLBD", "balance_amount": {"amount": "2850.10"}}]})
    respx.get(f"{API}/accounts/acc-spaar-00002/balances").respond(json={"balances": [{"balance_type": "CLBD", "balance_amount": {"amount": "12400"}}]})
    async with httpx.AsyncClient() as c:
        url, state = await rabobank.start(c, APP, rabobank.DEFAULT_REDIRECT)
        sent = json.loads(auth.calls[0].request.content)
        assert url == "https://bank.example/login" and sent["aspsp"] == {"name": "Rabobank", "country": "NL"}
        assert sent["state"] == state and sent["psu_type"] == "personal" and sent["redirect_url"] == "https://localhost/meridian"
        assert auth.calls[0].request.headers["Authorization"].startswith("Bearer ")
        secret = await rabobank.finish(c, APP, "XYZ")
        res = await rabobank.fetch(c, secret)
    assert [p.name for p in res.positions] == ["Betaalrekening ·6789", "Rabo SpaarRekening ·4321"]  # nooit de naam van de rekeninghouder
    assert [p.tile for p in res.positions] == [4, 3] and res.value == 15250.1 and not res.warnings


@respx.mock
async def test_errors_and_expiry():
    with pytest.raises(rabobank.BankError, match="Nog geen toestemming"):
        await rabobank.fetch(None, APP)
    with pytest.raises(rabobank.BankError, match="verlopen"):
        await rabobank.fetch(None, {**APP, "session_id": "s", "accounts": [], "valid_until": "2000-01-01T00:00:00Z"})
    respx.get(f"{API}/accounts/a/balances").respond(json={"balances": [{"balance_type": "CLBD", "balance_amount": {"amount": "1"}}]})
    soon = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + 5 * 86400))
    async with httpx.AsyncClient() as c:
        res = await rabobank.fetch(c, {**APP, "session_id": "s", "accounts": [{"uid": "a"}], "valid_until": soon})
        assert "verloopt over 4 dagen" in res.warnings[0] or "verloopt over 5 dagen" in res.warnings[0]
        respx.get(f"{API}/accounts/b/balances").respond(401, json={"message": "Invalid JWT"})
        with pytest.raises(rabobank.BankError, match="401"):
            await rabobank.fetch(c, {**APP, "session_id": "s", "accounts": [{"uid": "b"}]})


async def test_bank_is_fetched_at_most_every_6_hours(store, monkeypatch):
    calls = []

    async def fake(client, secret):
        calls.append(1)
        return rabobank.SourceResult(id="rabobank", name="Rabobank")

    monkeypatch.setitem(portfolio.FETCHERS, "rabobank", fake)
    store.set_secret("rabobank", {"app_id": "x"})
    await portfolio.build(store, None, force=True)
    await portfolio.build(store, None, force=True)  # verversen in de app: niet opnieuw bij de bank
    assert len(calls) == 1
    portfolio._cache["rabobank"].at -= 7 * 3600
    await portfolio.build(store, None, force=True)
    assert len(calls) == 2


async def test_manual_rabo_balances_not_counted_twice(store, monkeypatch):
    async def fake(client, secret):
        return rabobank.SourceResult(id="rabobank", name="Rabobank")

    monkeypatch.setitem(portfolio.FETCHERS, "rabobank", fake)
    store.set_setting("manual", {"banks": [{"bank": "Rabobank", "name": "Betaal", "value": 200},
                                           {"bank": "Rabobank", "name": "Spaar", "kind": "spaar", "value": 100},
                                           {"bank": "ING", "name": "Oranje", "value": 50}]})
    p = await portfolio.build(store, None)
    assert [x["name"] for x in p["positions"]] == ["Betaal", "Spaar", "Oranje"]
    store.set_secret("rabobank", {"app_id": "x", "accounts": [{"uid": "a", "savings": False}]})
    p = await portfolio.build(store, None)
    assert [x["name"] for x in p["positions"]] == ["Spaar", "Oranje"]  # spaarrekening zit niet in de koppeling
    store.set_secret("rabobank", {"app_id": "x", "accounts": [{"uid": "a", "savings": False}, {"uid": "b", "savings": True}]})
    p = await portfolio.build(store, None)
    assert [x["name"] for x in p["positions"]] == ["Oranje"]


async def test_bank_error_is_not_retried_every_minute(store, monkeypatch):
    calls = []

    async def broken(client, secret):
        calls.append(1)
        raise rabobank.BankError("storing")

    monkeypatch.setitem(portfolio.FETCHERS, "rabobank", broken)
    store.set_secret("rabobank", {"app_id": "x"})
    p = await portfolio.build(store, None)
    await portfolio.build(store, None)
    assert len(calls) == 1 and p["sources"][0]["status"] == "fout"
    portfolio._cache["rabobank"].tried -= 16 * 60
    await portfolio.build(store, None)
    assert len(calls) == 2
