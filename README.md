# Meridian

Persoonlijk vermogens- en beleggingsdashboard voor Android (Nederlands, EUR). Bundelt Trading 212, OKX, Trezor Safe 5, ING en handmatige bezittingen (goud, pensioen, woning) in één overzicht, met handelen via Trading 212 en OKX.

## Status
Stap 1–3 gebouwd: de Expo-app in `app/` met het thema, de schermen Overzicht, Portefeuille en Detail, en het vergrendelscherm met pincode en vingerafdruk (voorbeelddata).

**De app op je telefoon openen:** volg [`docs/STARTEN.md`](docs/STARTEN.md). Daar staat stap voor stap hoe je Node.js, Git en Expo Go installeert en de app start.

## Inhoud
```
app/                                  ← de app (Expo, TypeScript); zie app/README.md
design/
  Vermogen App (offline).html         ← open dit: werkt zonder internet, alle schermen
  Vermogen App v4.dc.html      ← bronbestand van het prototype
  Vermogen Extras.dc.html            ← naam, icoon, opstartscherm, widgets, meldingen, liggende grafiek
  Variaties nieuwe schermen.dc.html   ← alternatieven voor Volglijst en Herbalanceren
  android-frame.jsx, support.js       ← nodig om de .dc.html-bestanden te openen
docs/
  STARTEN.md                          ← de app op je telefoon openen (Node.js, Git, Expo Go)
  ADVIES-STACK.md                     ← waarmee bouwen en in welke volgorde
  tokens.json                         ← alle ontwerpwaarden
  HANDOFF.md                          ← specificatie voor de ontwikkelaar: kleuren, typografie, schermen, gedrag
```

## Bekijken
- Snelst: download `design/Vermogen App (offline).html` en open het in je browser.
- De `.dc.html`-bestanden werken als je ze via een lokale webserver opent (bijv. `npx serve design`), omdat ze `support.js` en `android-frame.jsx` laden.

## Volgende stap
Stap 4 uit `docs/ADVIES-STACK.md`: de Python-server (FastAPI) en de bronnen, eerst alleen-lezen: Trading 212, OKX, Trezor-xpub en ING. Tot die tijd is alle data voorbeelddata.
