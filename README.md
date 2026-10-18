# Vermogen

Persoonlijk vermogens- en beleggingsdashboard voor Android (Nederlands, EUR). Bundelt Trading 212, OKX, Trezor Safe 5, ING en handmatige bezittingen (goud, pensioen, woning) in één overzicht, met handelen via Trading 212 en OKX.

## Status
Ontwerpfase. Deze repository bevat het hi-fi ontwerp als klikbaar HTML-prototype. Er is nog geen app-code.

## Inhoud
```
design/
  Vermogen App (offline).html         ← open dit: werkt zonder internet, alle schermen
  Vermogen App v2 Donker.dc.html      ← bronbestand van het prototype
  Variaties nieuwe schermen.dc.html   ← alternatieven voor Volglijst en Herbalanceren
  android-frame.jsx, support.js       ← nodig om de .dc.html-bestanden te openen
docs/
  HANDOFF.md                          ← specificatie voor de ontwikkelaar: kleuren, typografie, schermen, gedrag
```

## Bekijken
- Snelst: download `design/Vermogen App (offline).html` en open het in je browser.
- De `.dc.html`-bestanden werken als je ze via een lokale webserver opent (bijv. `npx serve design`), omdat ze `support.js` en `android-frame.jsx` laden.

## Volgende stap
Bouwen in Jetpack Compose (Material 3) volgens `docs/HANDOFF.md`. Alle data in het prototype is voorbeelddata.
