# Meridian — app (Expo)

De Android-app van Meridian, gebouwd met Expo (React Native) en TypeScript. Dit is **stap 1–2** uit `docs/ADVIES-STACK.md`: het thema (donker en licht) en de schermen Overzicht, Portefeuille en Detail, precies volgens `design/Vermogen App v4.dc.html`. Alle bedragen zijn nog voorbeelddata.

## Wat werkt
- **Overzicht:** hero met het totaal dat optelt, een grafiek die zich tekent en waar je overheen kunt slepen (scrubben), S&P 500 en Bitcoin aan/uit, periodes 1D–Alles, kerncijfers, "Waar het staat" (een tik opent Portefeuille met het juiste filter), bronnen, doelen, pensioen/overwaarde en Box 3.
- **Portefeuille:** snelkoppelingen, Categorie/Bron, Dag/Totaal, filterchips, posities per groep, volglijst en "Buiten belegd vermogen".
- **Detail:** tik op een positie; koers in goud, scrubbare grafiek met periodes, jouw positie, per bewaarplek (BTC), dividend, transacties, knoppen Kopen/Verkopen.
- **Meer:** via de avatar (JV) rechtsboven; hier zet je het donkere thema uit of aan.
- **Privacy:** het oog-icoon verbergt alle bedragen (`€ ••••`), procenten blijven zichtbaar.

Nog niet gebouwd (volgende stappen): Doelen, Activiteit, Handelen, Zoeken, Meldingen, Orders en de andere schermen. Tikken daarop geeft de melding "Komt in een volgende stap".

## Op je telefoon testen
1. Installeer [Node.js](https://nodejs.org) (LTS) op je computer en de app **Expo Go** op je Android-telefoon.
2. In deze map:
   ```bash
   npm install
   npm start
   ```
3. Scan de QR-code in de terminal met Expo Go. Telefoon en computer moeten op hetzelfde wifi-netwerk zitten. Lukt dat niet, gebruik dan `npx expo start --tunnel`.

In de browser bekijken kan ook: `npm run web`.

## Controleren
```bash
npm run typecheck   # TypeScript
npm run lint        # ESLint
npm test            # Jest: bedragen, grafiekdata, totalen, groepen, FIRE-projectie
```

## Mappen
```
src/app/         schermen voor de router (expo-router): index = tabs, positie/[id], meer
src/screens/     Overzicht, Portefeuille, Detail, Meer, tabbalk-host
src/components/  Hero, LineChart, NavBar, Toast, Icon, T (tekst), ui (kaarten, knoppen, chips)
src/theme/       kleuren voor donker/licht (uit docs/tokens.json), lettertypen, ruimte, beweging
src/data/        voorbeelddata uit het prototype
src/lib/         opmaak (nl-NL), grafiekreeksen, portefeuille-berekeningen + tests
scripts/         generate-icons.mjs: zet Material Symbols om naar src/components/iconPaths.ts
```

## Goed om te weten
- **Kleurverlopen en schaduwen** gebruiken `backgroundImage` en `boxShadow` van React Native (nieuwe architectuur). Op heel oude Android-versies kunnen schaduwen er eenvoudiger uitzien.
- **Iconen** zijn Material Symbols Outlined als SVG. Een nieuw icoon nodig? Zet de naam in `scripts/generate-icons.mjs` en draai het script (uitleg staat bovenin).
- **Grafieken** gebruiken dezelfde voorbeeldreeksen als het prototype, zodat ze er precies hetzelfde uitzien. Bij stap 4 komen hier echte koersen van de server.
