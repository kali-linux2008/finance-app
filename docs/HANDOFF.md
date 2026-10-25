# Handoff: Meridian — persoonlijk vermogens- en beleggingsdashboard (Android)

## Overview
Mobiele app (Android, Nederlands) voor een actieve particuliere belegger (persona: Joris, 26 jaar, ± € 65k belegd + gespaard). De app bundelt Trading 212, OKX, Trezor Safe 5 (alleen-lezen via xpub), Rabobank (PSD2) en handmatige bezittingen (goud, pensioen ABP, woning/hypotheek) in één overzicht in EUR, en laat handelen toe via Trading 212 (aandelen/ETF) en OKX (crypto), inclusief limietorders en periodiek inleggen.

## About the Design Files
De bestanden in deze bundel zijn **designreferenties gemaakt in HTML**: prototypes die het beoogde uiterlijk en gedrag tonen, geen productiecode. De opdracht is om deze ontwerpen **opnieuw te bouwen in de doelomgeving** (bijv. Jetpack Compose, React Native of Flutter) met de daar gebruikelijke patronen. Is er nog geen codebase, kies dan het meest passende framework; voor een Android-first app met native biometrie ligt Jetpack Compose (Material 3) voor de hand.

Open `Vermogen App v4.dc.html` in een browser. Links staat een lijst om direct naar elk scherm te springen; rechts de homescreen-widget. Alle data is voorbeelddata.

## Naam
**Meridian** (gekozen). App-icoon en opstartscherm: zie `Vermogen Extras.dc.html` 5a/5b. De bestandsnamen beginnen nog met "Vermogen".

## Nieuw in v4
- Alles iets ruimer: tekstmarge 24px (was 20), kaarten 16px van de rand (was 12), sectiekoppen 30px boven, lijstregels 13px × 16px, kaartinhoud 20px.
- Lichte thema in luxe stijl (gouden lijst, verloopknoppen, diepere blauwe hero). Zie `tokens.json`.
- Inzichten: kaart "Vanaf 2028 · werkelijk rendement" naast de huidige Box 3-schatting. Volgens het wetsvoorstel (36% boven € 1.800 heffingsvrij resultaat), maar de Eerste Kamer heeft nog niet gestemd. Houd tarief en vrijstelling instelbaar op de server.
- `Vermogen Extras.dc.html`: naam en app-icoon (5a), opstartscherm (5b), grafiek op volledig scherm (5c), widgets 2×2, 2×2-doel en 4×1 (5d), Android-meldingen en vergrendelscherm met privacy (5e).
- `tokens.json`: alle ontwerpwaarden als bestand.
- `ADVIES-STACK.md`: advies over waarmee je bouwt en in welke volgorde.

## Fidelity
**High-fidelity.** Kleuren, typografie, afstanden, radii en interacties zijn definitief. Bouw pixel-getrouw na.

## Design Tokens

### Kleur — donker (standaard)
| Token | Waarde | Gebruik |
|---|---|---|
| page | #0C0B09 | achter het toestel (alleen preview) |
| bg | #15140F | schermachtergrond (warm zwart) |
| surface | #1E1C17 | kaarten, lijsten |
| surface2 | #2A2822 | segment-tracks, iconvakken, stepper-knoppen |
| ink | #F2EEE4 | primaire tekst |
| muted | #A39D90 | secundaire tekst |
| faint | #6F6A60 | tertiair, uit-toggles |
| line | rgba(255,250,240,.09) | scheidingslijnen |
| accent | #8EA2F0 | **acties**: knoppen, links, grafieklijnen, toggles aan |
| onAccent | #0F1530 | tekst op accent |
| accentSoft | #2A3360 | info-banners |
| gold | #D9BC82 | **waarde**: totalen, doelen, rapportbedragen, actieve periode-chip |
| onGold | #241D0E | tekst op goud |
| pos / neg | #6BC48F / #E8826E | winst / verlies |
| heroBg | radial-gradient(130% 90% at 100% 0%, #4361D6 0%, #2840A8 42%, #141F5A 100%) | hoofdkaart, doelen-hero, vergrendelscherm, widget |
| hero-rand | 1px rgba(217,188,130,.38) | gouden haarlijn rond hero |
| hero-bedrag | #F6E7C4 (centen #C9B27E) | champagne-tekst op hero |
| hero-label | #E2CB98, 11px, letter-spacing .12em, uppercase, met 14×1px gouden streep | |
| tegels | t1 #2A3B8F (aandelen), t2 #4A3F25 (crypto), t3 #2C3A31 (sparen), t4 #2A2822 (betaal), t5 #3A3224 (goud) | |
| scrim | rgba(0,0,0,.55) | achter bottom sheets |

### Kleur — licht (optioneel)
bg #F6F2EA · surface #FDFBF6 · surface2 #EDE7DB · ink #1B1912 · muted #6B665B · faint #A39D90 · line rgba(70,55,25,.10) · accent #3550C9 · accentSoft #E1E6F8 · gold #8A6420 · onGold #FFF8E6 · pos #2F7A4F · neg #B3412E · heroBg radial-gradient(130% 90% at 100% 0%, #5672E8 0%, #2E48C2 45%, #1C2C80 100%). Tegels: t1 #1F2A5C, t2 #E8D9B4, t3 #D6DED6, t4 #E6E1D5, t5 #EDE2CA.

### Typografie
- **Source Serif 4** (400/500): bedragen en koppen. Hero-totaal 46px/1.05; schermtitel 30px; detailprijs 38px; sectiekop 20px; rapport/inkomen-totaal 40px.
- **Manrope** (400–700): alle UI-tekst. Body 15px/600 (lijstregels), sub 12–13px, labels 11–12px, sectielabel 12px/700 uppercase letter-spacing .06em.
- Cijfers altijd `font-variant-numeric: tabular-nums`. Formattering nl-NL: `€ 64.830,42`, `+0,64%`, minteken `−` (U+2212).
- Iconen: Material Symbols Outlined, 20–24px; actief nav-icoon FILL 1.

### Vorm & ruimte
- Radii: hero 28px · kaarten 20px · tegels 18px · chips 10px · pill/segment 999px · knoppen 26px (hoogte 52px) · bottom sheet 28px boven.
- Schermmarge: kaarten 16px van rand, tekst 24px. Ruimte boven secties 30px, binnen kaarten 20px.
- Lijstregel: grid `40px 1fr auto`, gap 12px, padding 13px 16px; ticker-vak 40×40 radius 12.
- Hit targets ≥ 44px.
- Schaduw hero: `0 28px 56px -28px rgba(30,50,170,.85), inset 0 1px 0 rgba(255,255,255,.14)`. FAB: `0 8px 24px rgba(59,91,219,.35)`.

## Navigatie
Zwevende navigatiebalk (64px hoog, radius 32, 12px van de randen, 16px van onder) met vier tabs: Overzicht, Portefeuille, Doelen, Activiteit. Actieve tab = pill met label; inactief = alleen icoon. Rechts daarvan een ronde FAB (64px, accent) "Handelen" die de handel-sheet opent. Overige schermen openen als push met terugpijl; de balk is dan verborgen.

## Screens / Views
1. **Vergrendelscherm**: heroBg, titel "Meridian" in champagne, 5 pin-dots (gouden rand), keypad 72px-cirkels, vingerafdruk links onder. Na ontgrendelen volgt het laadscherm.
2. **Laadscherm**: skeletons met shimmer (1,3s lineair) in de vorm van het overzicht, en de regel "Synchroniseren · Trading 212, Rabobank, OKX, Trezor". Duurt ± 1,5s.
3. **Overzicht**: begroeting + datum; iconen privacy (oog), zoeken, meldingen (met stip), avatar. Hero met belegd vermogen, delta-pill, grafiek (120px) met S&P 500- en Bitcoin-vergelijking (aan/uit), periodes 1D/1W/1M/1J/Alles (standaard Alles, actieve chip goud). **Scrubben**: slepen over de grafiek toont de waarde op dat moment in de hero. Daaronder: strip met Vandaag / Rendement (IRR, TWR of simpel) / Kosten; treemap "Waar het staat"; bronnentegels (2×2); doelen (FIRE € 500k, noodbuffer € 15k); pensioen + overwaarde (buiten belegd vermogen); Box 3-schatting.
4. **Portefeuille**: totaal in goud; drie snelkoppelingen (Orders, Periodiek, Balans; gouden stip bij aandacht nodig); segmenten Categorie/Bron en Dag/Totaal; filterchips; gegroepeerde posities; volglijst-carrousel; "Buiten belegd vermogen".
5. **Detail belegging**: prijs in goud, scrubbare grafiek, positie-stats (2-koloms grid), per bewaarplek (BTC: Trezor/OKX), dividend, transacties, onderbalk Verkopen/Kopen. Knop rechtsboven opent de koersalert.
6. **Handelen** (bottom sheet): kies een belegging → kopen of verkopen → candles met volume (15 min, 40 bars) → bedrag via keypad → markt- of limietorder (stappen van ±0,5%) → periodiek inleggen (wekelijks/maandelijks) → kosten → controleren → vingerafdruk → klaar. Validatie: bedrag > 0, minimaal € 1, bij verkopen maximaal het saldo (BTC: alleen het OKX-deel, Trezor is alleen-lezen).
7. **Activiteit**: maandsamenvatting; filterchips Alles/Kopen/Verkopen/Dividend/Rente/Overboekingen; regels per maand gegroepeerd.
8. **Doelen**: FIRE-hero met projectiegrafiek; sliders voor maandinleg (100–2500) en rendement (2–10%), die direct het jaartal en de mijlpalen (€ 100k/250k/500k) bijwerken. Noodbuffer; knop "Doel toevoegen".
9. **Inkomen & dividend**: 12-maanden totaal, gestapelde staafjes dividend/rente, verwachte uitbetalingen en een link naar de kalender.
10. **Dividendkalender**: maandraster (ma–zo), stip goud = dividend, groen = rente, vandaag omrand in accent. Tik op een dag om de lijst te filteren (geselecteerde dag krijgt een gouden vulling). Statussen: Ontvangen / Aangekondigd / Verwacht.
11. **Inzichten & allocatie**: verdeling per activaklasse, regio en valuta (balk + lijst); concentratiemelding; kosten 2026; Box 3-uitsplitsing.
12. **Rapporten**: maand en jaar; balkoverzicht (begin → netto inleg → rendement → eind); bij het jaar ook rendement per maand; stats; download als PDF.
13. **Zoeken**: zoekveld (ticker/naam/ISIN), chips Alles/Aandelen/ETF's/Crypto, sector- en regiofilter (tik = volgende waarde), label "IN BEZIT" voor eigen posities, lege staat met "Filters wissen".
14. **Koersalert**: stijgt boven of daalt onder; doelkoers groot in goud; ± stappen en snelknoppen 2/5/10/20%; grafiek met een gestippelde gouden doellijn; "elke keer melden"; lijst actieve alerts.
15. **Volglijst**: sorteren op dag % of naam; bewerkmodus (verwijderen); tik op een regel opent de koersalert; lege staat.
16. **Lopende orders**: brokerstatus (T212 "Markt gesloten" amber, OKX "Online" groen); tabs Open / Vandaag uitgevoerd. Een order klapt open om de limiet te wijzigen (±0,5%) of te annuleren. Nieuwe orders krijgen een accentrand.
17. **Periodiek inleggen**: totaal per maand in goud; plannen met status Actief/Gepauzeerd. **Plan-detail**: bedrag-stepper (±€ 10), frequentie, pauzeren; grafiek met de koers bij elke aankoop (stippen) en de gemiddelde aankoopprijs (gouden stippellijn), plus uitleg van het effect; stats; historie.
18. **Herbalanceren**: doel per klasse (stappen van 5%) met een balk "nu" en een gouden doelmarker; foutmelding als het totaal niet 100% is. Modus "Alleen bijkopen" geeft advies en een link naar periodiek inleggen. Modus "Kopen & verkopen" toont voorgestelde orders om aan te vinken, plus "Zelf doen" (overboeken, goud, Trezor). Bevestigen via vingerafdruk; Trading 212-orders verschijnen daarna onder Orders, OKX-orders onder Activiteit.
19. **Bronnen**: lijst gekoppelde bronnen met syncstatus; nieuwe toevoegen. Een sheet toont de koppelstappen (API-sleutel, xpub met QR-scan, PSD2).
20. **Meldingen**: feed en instellingen (koersalerts, dividend, mijlpalen, weekoverzicht).
21. **Meer**: profiel, links naar alle secundaire schermen, toggles (donker thema, privacymodus, vingerafdruk), vergrendelen.
22. **Onboarding (7 stappen + welkom + klaar)**: welkom-hero → privacybeloftes → pincode (5 cijfers) → vingerafdruk → basisvaluta + Box 3 → bronnen koppelen (knoppen Koppel → Bezig → Gekoppeld; minimaal één bron nodig) → doelen (chips) → meldingen → afronding met samenvatting. Gouden voortgangsbalk bovenin.
23. **Widget 4×2**: heroBg, totaal, dagdelta, sparkline 1D, drie grootste bewegers.

Variaties voor Volglijst en Herbalanceren staan in `Variaties nieuwe schermen.dc.html` (opties 1a–1c en 2a–2c). In het prototype zitten 1a en 2a.

## Interactions & Behavior
- **Schermovergang**: `translateX(28px)→0` + opacity, 400ms, cubic-bezier(.2,.8,.2,1).
- **Lijstregels**: verschijnen na elkaar (translateY 14px→0, 450ms, 30–35ms vertraging per regel, maximaal 12 regels).
- **Hero-totaal** telt op van 0 naar het eindbedrag (1500ms, ease-out quart) bij openen en na ontgrendelen.
- **Grafieken** tekenen zich van links naar rechts via een clip-path (1,1–1,3s).
- **Bottom sheets**: translateY 48px→0 (250ms), scrim fade 200ms.
- **Succes-check**: pop (scale .5→1,08→1, 500ms).
- **Toggles**: knop beweegt in 200ms cubic-bezier(.3,.7,.2,1.3).
- **Toast**: onderin, 2,4s zichtbaar.
- **Privacymodus**: alle bedragen worden `€ ••••`, procenten blijven zichtbaar.
- **Scrubben**: pointer down/move zet het tijdstip, loslaten herstelt het huidige bedrag. Op touch blijft de pointer vastgehouden tijdens het slepen.
- Elke order vraagt bevestiging met vingerafdruk of pincode.

## State Management
- Sessie: vergrendeld, laden, privacy, thema.
- Navigatie: huidig scherm + stack (push/back), actieve tab.
- Data per bron (posities, saldi, transacties) met een sync-tijdstip per bron.
- Handel-concept: product, kopen/verkopen, bedrag, type (markt/limiet), limiet-offset, periodiek, frequentie, stap.
- Orders (open, met broker en status), plannen (bedrag, frequentie, actief), volglijst (tickers), alerts (ticker, richting, prijs, herhalen), herbalanceer-doelen per klasse.
- Afgeleid: totalen, allocatie, IRR/TWR, Box 3 (vermogen op 1 jan − heffingsvrij € 57.684), DCA-gemiddelde, afwijking per klasse.

## Assets
Geen bitmaps. Fonts via Google Fonts (Source Serif 4, Manrope, Material Symbols Outlined). Grafieken zijn SVG-paden die uit data worden gegenereerd. Logo's van brokers zijn bewust vervangen door ticker- of iconvakken; gebruik echte logo's alleen met toestemming.

## Files
- `Vermogen App v4.dc.html`: volledig klikbaar prototype (alle schermen en de logica).
- `Vermogen Extras.dc.html`: naam, icoon, opstartscherm, liggende grafiek, widgets, meldingen.
- `tokens.json`, `ADVIES-STACK.md`.
- `Variaties nieuwe schermen.dc.html`: variaties voor Volglijst en Herbalanceren.
- `android-frame.jsx`: Android-toestelframe, alleen voor de preview.
- `support.js`: runtime om de .dc.html-bestanden in een browser te openen.
