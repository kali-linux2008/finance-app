"""Trezor (of andere hardware wallet): saldo uit je publieke sleutel, alleen-lezen.

Je seed en privésleutels verlaten je Trezor nooit. Met de publieke sleutel (xpub/ypub/zpub of een
descriptor zoals tr([...]xpub.../<0;1>/*)) rekenen we je adressen uit en vragen hun saldo op
bij een openbare blockchain-dienst (standaard mempool.space).
"""

import asyncio
import re

import httpx
from embit import script
from embit.bip32 import HDKey
from embit.networks import NETWORKS

from .. import config, prices
from ..models import Position, SourceResult

GAP_LIMIT = 20  # na zoveel ongebruikte adressen op rij stoppen we met zoeken
SATS = 100_000_000


class TrezorError(Exception):
    pass


def parse(public: str) -> tuple[HDKey, str | None]:
    """Geeft (sleutel, adrestype) terug: 'pkh', 'sh-wpkh', 'wpkh' of 'tr'.

    Bij een kale xpub weten we het type niet zeker (legacy, SegWit of Taproot); dan is het None
    en kijkt balance_sats welk type adressen echt gebruikt is.
    """
    s = public.strip()
    if re.search(r"\b[xyzt]prv", s):
        raise TrezorError("Dit is een privésleutel! Gebruik alleen de publieke sleutel (xpub). Deel je privésleutel nooit.")
    m = re.match(r"^(tr|wpkh|sh\(wpkh|pkh)\((?:\[[^\]]*\])?([a-zA-Z0-9]+)", s)
    if m:
        kind = {"tr": "tr", "wpkh": "wpkh", "sh(wpkh": "sh-wpkh", "pkh": "pkh"}[m.group(1)]
        s = m.group(2)
    else:
        prefixes = {"xpub": None, "ypub": "sh-wpkh", "zpub": "wpkh"}
        if s[:4] not in prefixes:
            raise TrezorError("Dit lijkt geen publieke sleutel (xpub/ypub/zpub) of descriptor.")
        kind = prefixes[s[:4]]
    try:
        key = HDKey.from_string(s)
    except Exception as e:  # embit geeft verschillende fouttypes
        raise TrezorError("Publieke sleutel is ongeldig. Kopieer hem opnieuw uit Trezor Suite.") from e
    if key.is_private:
        raise TrezorError("Dit is een privésleutel! Gebruik alleen de publieke sleutel (xpub).")
    return key, kind


def address(key: HDKey, kind: str, chain: int, index: int) -> str:
    pub = key.derive([chain, index]).key
    net = NETWORKS["main"]
    if kind == "wpkh":
        return script.p2wpkh(pub).address(net)
    if kind == "sh-wpkh":
        return script.p2sh(script.p2wpkh(pub)).address(net)
    if kind == "tr":
        return script.p2tr(pub).address(net)
    return script.p2pkh(pub).address(net)


# Reserve als de eerste dienst traag is. Wie een eigen node instelt (MERIDIAN_ESPLORA_URL), gebruikt alleen die.
FALLBACK_URL = "https://blockstream.info/api"
PARALLEL = 4  # zoveel adressen tegelijk opvragen; meer maakt de openbare diensten boos
TIMEOUT = 8  # per adres; een trage dienst slaan we liever over dan dat we erop wachten

# De dienst die het laatst goed werkte, proberen we eerst. Zo betaalt niet elk adres
# opnieuw de wachttijd van een dienst die traag is of ons tijdelijk weigert.
_preferred: str | None = None


def esplora_urls() -> list[str]:
    custom = config.ESPLORA_URL != "https://mempool.space/api"
    urls = [config.ESPLORA_URL] if custom else [config.ESPLORA_URL, FALLBACK_URL]
    if _preferred in urls:
        urls.remove(_preferred)
        urls.insert(0, _preferred)
    return urls


async def _address_info(client: httpx.AsyncClient, addr: str) -> tuple[int, int]:
    """(aantal transacties, saldo in satoshi incl. onbevestigd). Probeert per dienst twee keer."""
    global _preferred
    problem = "Blockchain-dienst: te veel verzoeken, probeer het zo opnieuw."
    for base in esplora_urls():
        for attempt in range(2):
            try:
                r = await client.get(f"{base}/address/{addr}", timeout=TIMEOUT)
            except httpx.TimeoutException:
                problem = f"Blockchain-dienst ({base}) reageert te traag. Probeer het zo opnieuw."
                break  # niet nog eens wachten: meteen de volgende dienst
            except httpx.HTTPError as e:
                problem = f"Blockchain-dienst ({base}) niet bereikbaar: {e.__class__.__name__} {e}".strip()
                break  # deze dienst is echt weg: meteen de volgende proberen
            if r.status_code == 429:
                problem = f"Blockchain-dienst ({base}): te veel verzoeken, probeer het zo opnieuw."
                await asyncio.sleep(1 + attempt * 2)
                continue
            if r.status_code >= 400:
                problem = f"Blockchain-dienst ({base}) gaf fout {r.status_code}"
                break
            d = r.json()
            _preferred = base
            cs, ms = d.get("chain_stats", {}), d.get("mempool_stats", {})
            txs = cs.get("tx_count", 0) + ms.get("tx_count", 0)
            sats = (cs.get("funded_txo_sum", 0) - cs.get("spent_txo_sum", 0)
                    + ms.get("funded_txo_sum", 0) - ms.get("spent_txo_sum", 0))
            return txs, sats
    raise TrezorError(problem)


async def _scan_chain(client: httpx.AsyncClient, key: HDKey, kind: str, chain: int, gap: int) -> int:
    """Telt het saldo van één reeks adressen, steeds PARALLEL tegelijk, tot `gap` ongebruikte op rij."""
    total, unused, i = 0, 0, 0
    while unused < gap:
        batch = [address(key, kind, chain, j) for j in range(i, i + PARALLEL)]
        results = await asyncio.gather(*(_address_info(client, a) for a in batch))
        for txs, sats in results:  # in volgorde, zodat de gap-telling klopt
            if unused >= gap:
                break
            total += sats
            unused = unused + 1 if txs == 0 else 0
        i += PARALLEL
    return total


async def balance_sats(client: httpx.AsyncClient, public: str, gap: int = GAP_LIMIT) -> int:
    key, kind = parse(public)
    if kind is None:
        kind = "pkh"
        for candidate in ("wpkh", "tr", "pkh"):
            if (await _address_info(client, address(key, candidate, 0, 0)))[0] > 0:
                kind = candidate
                break
    receive, change = await asyncio.gather(_scan_chain(client, key, kind, 0, gap), _scan_chain(client, key, kind, 1, gap))
    return receive + change


async def fetch(client: httpx.AsyncClient, secret: dict) -> SourceResult:
    res = SourceResult(id="trezor", name=secret.get("label") or "Trezor Safe 5")
    btc = await balance_sats(client, secret["xpub"]) / SATS
    if btc <= 0:
        return res
    price, day = await prices.eur_price(client, "BTC")
    res.change = round(day, 2)
    res.positions.append(Position(
        id="trezor-BTC", tk="BTC", name="Bitcoin", cls="Crypto", cat="cr", src=res.name,
        value=round(btc * price, 2), tile=2, qty=round(btc, 8), unit="BTC", price=price, cur="EUR",
        dayChange=round(day, 2),
    ))
    return res
