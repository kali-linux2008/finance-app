# Meridian

Persoonlijk vermogens- en beleggingsdashboard voor Android (Nederlands, EUR). Bundelt Trading 212, OKX, Trezor Safe 5, ING en handmatige bezittingen (goud, pensioen, woning) in één overzicht, met handelen via Trading 212 en OKX.

## Status
Stap 1–5 gebouwd:
- de Expo-app in `app/`: thema, Overzicht, Portefeuille, Detail, het vergrendelscherm met pincode en vingerafdruk, het handelsvenster en Lopende orders;
- de server in `server/` (Python/FastAPI): haalt je echte saldi op bij Trading 212, OKX en je Trezor, plus handmatige bezittingen zoals Rabobank, goud, pensioen en woning (alleen-lezen);
- handelen via Trading 212 en OKX: standaard met oefengeld (demo); echt geld alleen als je het op de server aanzet. Met aparte handelssleutels, een dagmaximum en een orderlogboek.

Zonder gekoppelde server toont de app voorbeelddata.

**De app op je telefoon openen:** volg [`docs/STARTEN.md`](docs/STARTEN.md). Daar staat stap voor stap hoe je Node.js, Git en Expo Go installeert en de app start.

**De server installeren en je accounts koppelen:** volg [`docs/SERVER.md`](docs/SERVER.md).

## Inhoud
```
app/                                  ← de app (Expo, TypeScript); zie app/README.md
server/                               ← de server (Python, FastAPI, Docker); zie server/README.md
design/
  Vermogen App (offline).html         ← open dit: werkt zonder internet, alle schermen
  Vermogen App v4.dc.html      ← bronbestand van het prototype
  Vermogen Extras.dc.html            ← naam, icoon, opstartscherm, widgets, meldingen, liggende grafiek
  Variaties nieuwe schermen.dc.html   ← alternatieven voor Volglijst en Herbalanceren
  android-frame.jsx, support.js       ← nodig om de .dc.html-bestanden te openen
docs/
  STARTEN.md                          ← de app op je telefoon openen (Node.js, Git, Expo Go)
  SERVER.md                           ← de server installeren en Trading 212, OKX, Trezor koppelen
  ADVIES-STACK.md                     ← waarmee bouwen en in welke volgorde
  tokens.json                         ← alle ontwerpwaarden
  HANDOFF.md                          ← specificatie voor de ontwikkelaar: kleuren, typografie, schermen, gedrag
```

## Bekijken
- Snelst: download `design/Vermogen App (offline).html` en open het in je browser.
- De `.dc.html`-bestanden werken als je ze via een lokale webserver opent (bijv. `npx serve design`), omdat ze `support.js` en `android-frame.jsx` laden.

## Volgende stap
Stap 6 uit `docs/ADVIES-STACK.md`: koersalerts, meldingen, periodiek inleggen en herbalanceren.
