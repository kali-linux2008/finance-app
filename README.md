# Meridian

Persoonlijk vermogens- en beleggingsdashboard voor Android (Nederlands, EUR). Bundelt Trading 212, OKX, Trezor Safe 5, ING en handmatige bezittingen (goud, pensioen, woning) in één overzicht, met handelen via Trading 212 en OKX.

## Status
Stap 1–2 gebouwd: de Expo-app in `app/` met het thema en de schermen Overzicht, Portefeuille en Detail (voorbeelddata). Zie `app/README.md` om hem op je telefoon te starten.

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
  ADVIES-STACK.md                     ← waarmee bouwen en in welke volgorde
  tokens.json                         ← alle ontwerpwaarden
  HANDOFF.md                          ← specificatie voor de ontwikkelaar: kleuren, typografie, schermen, gedrag
```

## Bekijken
- Snelst: download `design/Vermogen App (offline).html` en open het in je browser.
- De `.dc.html`-bestanden werken als je ze via een lokale webserver opent (bijv. `npx serve design`), omdat ze `support.js` en `android-frame.jsx` laden.

## Volgende stap
Stap 3 uit `docs/ADVIES-STACK.md`: het vergrendelscherm met pincode en vingerafdruk. Daarna de Python-server en de echte bronnen. Alle data is nog voorbeelddata.
