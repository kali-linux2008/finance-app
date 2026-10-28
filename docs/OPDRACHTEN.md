# Alle opdrachten op de server

Typ ze in de map `~/finance-app/server`, steeds met `docker compose exec meridian` ervoor:

```bash
cd ~/finance-app/server
docker compose exec meridian python -m meridian <opdracht>
```

`python -m meridian help` laat de korte lijst zien.

## Dagelijks

| Opdracht | Wat het doet |
|---|---|
| `status` | Alle bronnen ophalen en per bron laten zien of het lukt (en hoe lang het duurde) |
| `melding` | De laatste meldingen |
| `bank` | Waar je geld heen gaat: inleg Trading 212 en OKX, abonnementen, inkomsten en uitgaven per maand |
| `rendement` | Per broker: wat er nu staat tegenover wat je hebt ingelegd |
| `herbalanceren` | Je verdeling tegenover je doel, en wat je zou moeten kopen of verkopen |
| `herbalanceren bijkopen 375` | Hoe je € 375 nieuw geld het best verdeelt |

## Koppelen

| Opdracht | Wat het doet |
|---|---|
| `koppelcode` | Code om je telefoon te koppelen (10 minuten geldig) |
| `apparaten` | Gekoppelde telefoons, met wanneer ze voor het laatst keken |
| `apparaten weg 2` | Eén telefoon ontkoppelen (bijv. als je hem kwijt bent) |
| `ontkoppel` | Alle telefoons ontkoppelen |
| `bron trading212` / `bron okx` / `bron trezor` | Een bron toevoegen (alleen-lezen) |
| `bron rabobank` | Rabobank koppelen of de toestemming vernieuwen (elke 180 dagen) |
| `bron trading212-handel` / `bron okx-handel` | Handelssleutel (met `--echt` voor echt geld) |
| `bron weg <naam>` | Een koppeling verwijderen |
| `handmatig` | Saldi die niet automatisch komen (bijv. spaarrekening), goud, pensioen, woning |

## Handelen en inleggen

| Opdracht | Wat het doet |
|---|---|
| `handel` | Sleutels, dagmaximum en het orderlogboek |
| `handel maximum 250` | Dagmaximum voor oefengeld |
| `handel echtgeld aan` / `uit` | Handelen met echt geld toestaan of uitzetten |
| `handel echtgeld maximum 1000` | Dagmaximum voor echt geld |
| `handel periodiek` | Periodiek inleggen bekijken (`aan`, `uit`, `maximum 400`) |
| `herbalanceren doel aandelen 70 crypto 20 cash 10 goud 0` | Je doelverdeling (stappen van 5%, samen 100%) |

## Meldingen en Rabo-CSV

| Opdracht | Wat het doet |
|---|---|
| `melding test` | Testmelding naar je telefoon |
| `melding soorten` | Welke soorten aan staan; bijv. `melding soorten week uit`, `melding soorten orders aan` |
| `melding soorten doel 750000` | Je FIRE-doel (mijlpalen per 10%) |
| `melding csv` | Herinnering voor de Rabo-CSV; bijv. `melding csv wo 19`, `melding csv uit` |
| `bank tegenpartijen` | Hoe je tegenrekeningen zijn ingedeeld |
| `bank regel <IBAN> abo` | Deze rekening is je abonnementenrekening (soorten: t212, okx, abo, eigen, in, uit) |
| `bank regels` | Je eigen regels (`bank regel weg 1` om er een weg te halen) |
| `rendement start t212 5000` | Wat je vóór je eerste CSV al bij een broker had gestort |

## Wat de server zelf doet (op de achtergrond)

| Wanneer | Wat |
|---|---|
| elke 2 minuten | koersalerts nakijken |
| elke 10 minuten | grote koersbewegingen (±5%), uitgevoerde limietorders, dividend (elke 6 uur), mijlpalen |
| elk uur | bronnen bijwerken, ook als de app dicht is; melding als een bron een dag niet werkt |
| dag vóór de inleg, 09:00 | waarschuwing als er te weinig vrij saldo op Trading 212 staat |
| inlegdag, 15:45 | periodiek inleggen |
| zondag 10:00 | herinnering Rabo-CSV |
| zondag 18:00 | weekoverzicht met beste en slechtste belegging |
| elke nacht, na 03:00 | back-up van de database (14 bewaard) en opruimen van gegevens ouder dan 3 jaar |
