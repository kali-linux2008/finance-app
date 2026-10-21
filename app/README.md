# Meridian — app (Expo)

De Android-app van Meridian, gebouwd met Expo (React Native) en TypeScript. Klaar zijn **stap 1–3** uit `docs/ADVIES-STACK.md`: het thema (donker en licht), de schermen Overzicht, Portefeuille en Detail, en het vergrendelscherm met pincode en vingerafdruk. Alles volgt `design/Vermogen App v4.dc.html`. Alle bedragen zijn nog voorbeelddata.

**Nieuw met programmeren?** Volg `docs/STARTEN.md`: Node.js, Git en Expo Go installeren en de app op je telefoon openen, stap voor stap.

## Wat werkt
- **Vergrendelscherm:**
  - De eerste keer kies je een pincode van 5 cijfers en herhaal je die. Te makkelijke codes zoals 12345 of 11111 worden geweigerd.
  - Daarna open je de app met je vingerafdruk of je pincode. Na 5 foute pogingen moet je 30 seconden wachten, daarna steeds langer.
  - De app vergrendelt opnieuw als hij langer dan een minuut op de achtergrond stond, of via Meer → Vergrendelen.
- **Laadscherm:** na ontgrendelen ongeveer 1,5 seconde skeletten met glans en "Synchroniseren · Trading 212, ING, OKX, Trezor".
- **Overzicht:** hero met het totaal dat optelt, een grafiek die zich tekent en waar je overheen kunt slepen (scrubben), S&P 500 en Bitcoin aan/uit, periodes 1D–Alles, kerncijfers, "Waar het staat" (een tik opent Portefeuille met het juiste filter), bronnen, doelen, pensioen/overwaarde en Box 3.
- **Portefeuille:** snelkoppelingen, Categorie/Bron, Dag/Totaal, filterchips, posities per groep, volglijst en "Buiten belegd vermogen".
- **Detail:** tik op een positie; koers in goud, scrubbare grafiek met periodes, jouw positie, per bewaarplek (BTC), dividend, transacties, knoppen Kopen/Verkopen.
- **Meer:** via de avatar (JV) rechtsboven. Hier zet je het donkere thema en de vingerafdruk aan of uit, en kun je vergrendelen.
- **Privacy:** het oog-icoon verbergt alle bedragen (`€ ••••`), procenten blijven zichtbaar.

Nog niet gebouwd (volgende stappen): Doelen, Activiteit, Handelen, Zoeken, Meldingen, Orders en de andere schermen. Tikken daarop geeft de melding "Komt in een volgende stap".

## Op je telefoon testen
Uitgebreid, met uitleg en oplossingen: **`docs/STARTEN.md`**. In het kort:

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
npm test            # Jest: bedragen, grafiekdata, totalen, groepen, FIRE-projectie, pincoderegels
```

## Mappen
```
src/app/         schermen voor de router (expo-router): index = tabs, positie/[id], meer
src/screens/     Vergrendelscherm, Laadscherm, Overzicht, Portefeuille, Detail, Meer, tabbalk-host
src/components/  Hero, LineChart, NavBar, Toast, Icon, T (tekst), ui (kaarten, knoppen, chips)
src/theme/       kleuren voor donker/licht (uit docs/tokens.json), lettertypen, ruimte, beweging
src/data/        voorbeelddata uit het prototype
src/lib/         opmaak (nl-NL), grafiekreeksen, portefeuille-berekeningen, pincoderegels, opslag + tests
src/state/       app-status (thema, privacy, tab) en vergrendeling (pincode, vingerafdruk)
scripts/         generate-icons.mjs: zet Material Symbols om naar src/components/iconPaths.ts
```

## Goed om te weten
- **Pincode:** de pincode zelf wordt nergens opgeslagen. De app bewaart alleen een gezouten SHA-256-hash, versleuteld in de Android Keystore (`expo-secure-store`). Zolang de app vergrendeld is, worden de schermen met bedragen niet eens getekend.
- **Pincode vergeten?** In Expo Go: Instellingen → Apps → Expo Go → Opslag → Gegevens wissen. Een "pincode vergeten"-optie komt bij de onboarding (stap 7).
- **Kleurverlopen en schaduwen** gebruiken `backgroundImage` en `boxShadow` van React Native (nieuwe architectuur). Op heel oude Android-versies kunnen schaduwen er eenvoudiger uitzien.
- **Iconen** zijn Material Symbols Outlined als SVG. Een nieuw icoon nodig? Zet de naam in `scripts/generate-icons.mjs` en draai het script (uitleg staat bovenin).
- **Grafieken** gebruiken dezelfde voorbeeldreeksen als het prototype, zodat ze er precies hetzelfde uitzien. Bij stap 4 komen hier echte koersen van de server.
