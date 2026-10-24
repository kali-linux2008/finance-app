# Meridian-server

Kleine Python-server (FastAPI) die je saldi en posities ophaalt en aan de app geeft. Alles is **alleen-lezen**: handelen komt in stap 5.

- **Trading 212:** posities en cash (API-sleutel + geheim, alleen leesrechten)
- **OKX:** saldi van je handels- en fundingaccount, in euro omgerekend
- **Trezor:** BTC-saldo uit je publieke sleutel (xpub/zpub/descriptor), via mempool.space
- **Handmatig:** Rabobank-rekeningen, goud (waarde via de XAUT-koers), pensioen en woning
- **Verloop:** het totaal wordt elke 10 minuten bewaard voor de grafiek in de app

Installeren en gebruiken: zie **[docs/SERVER.md](../docs/SERVER.md)**.

## Beveiliging in het kort
- API-sleutels staan versleuteld (Fernet) in SQLite; de hoofdsleutel staat in `data/master.key` of in `MERIDIAN_MASTER_KEY`.
- Sleutels voer je in op de server zelf (`python -m meridian bron …`), dus nooit via de app of het netwerk.
- De app koppelt met een eenmalige code van 6 cijfers (10 min geldig, max. 5 pogingen) en krijgt een lange geheime sleutel. Op de server staat daarvan alleen een hash.
- Privésleutels (`xprv`) worden geweigerd.
- Handelen gaat met **aparte** handelssleutels (`bron trading212-handel`, `bron okx-handel`) standaard alleen op oefenaccounts. Echt geld zet je bewust aan op de server (`handel echtgeld aan`), met een eigen dagmaximum (standaard € 25). Elke order: minimaal € 1, dagmaximum, niet meer verkopen dan er staat, en een regel in het orderlogboek.

## Opbouw
```
meridian/
  api.py          HTTP-API voor de app (/api/health, /api/koppel, /api/portfolio, /api/history, /api/candles, /api/handel/…)
  trading.py      orders naar Trading 212 en OKX, controles en orderlogboek
  plans.py        periodiek inleggen: plan, planner (elke 5 min) en verslag per maand
  portfolio.py    bronnen ophalen, samenvoegen (BTC op Trezor + OKX = één positie), verloop bijhouden
  sources/        trading212.py · okx.py · trezor.py · manual.py
  prices.py       koersen in euro via de openbare OKX-marktdata
  store.py        SQLite + versleuteling
  auth.py         koppelcodes en apparaat-sleutels
  __main__.py     beheer: python -m meridian help
tests/            pytest; alle externe API's nagebootst
```

## Testen
```bash
pip install -r requirements-dev.txt
pytest
```
