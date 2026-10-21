# Advies: waarmee bouw je de app?

Je hebt al wat ervaring met JavaScript/React en Python, je begint verder vanaf nul en je wilt werken met Claude Code. Daarom raad ik dit aan:

## Aanbevolen: Expo (React Native) + een kleine Python-server

**App: Expo met TypeScript**
- Je React-kennis is direct bruikbaar. Componenten, state en hooks werken net als op het web.
- Expo regelt het bouwen van de Android-app voor je; testen gaat via de Expo Go-app op je telefoon.
- Alles wat het ontwerp nodig heeft bestaat al als pakket:
  - Vingerafdruk en pincode: `expo-local-authentication` en `expo-secure-store`.
  - Grafieken en scrubben: `react-native-skia` of `victory-native`.
  - Animaties: `react-native-reanimated`.
  - Meldingen: `expo-notifications`.
  - Widgets: `react-native-android-widget` (vraagt een eigen "development build", geen Expo Go).
  - Liggende grafiek: `expo-screen-orientation`.
- Wil je later toch een iPhone-versie, dan werkt grotendeels dezelfde code.

**Server: Python (FastAPI)**
- Koersalerts en de dagelijkse sync moeten ook draaien als de app dicht is. Daarvoor is een kleine server nodig, bijvoorbeeld op een Raspberry Pi of een goedkope VPS.
- Je Python-kennis past hier goed. `python-okx` bestaat al, en Trading 212 heeft een REST-API.
- De server haalt periodiek koersen en saldi op, controleert je alerts en stuurt pushmeldingen via Expo.
- API-sleutels staan dan versleuteld op je eigen server en niet in de app.

## Alternatieven

- **Jetpack Compose (Kotlin):** de mooiste en snelste Android-app, en widgets zijn hier het makkelijkst. Je moet wel een nieuwe taal leren, en er is geen iPhone-versie. Kies dit als je echt alleen Android wilt en het leren de moeite waard vindt.
- **PWA (webapp):** het snelst klaar met je React-kennis. Maar widgets, vingerafdruk en meldingen werken beperkt. Kies dit alleen voor een eerste proefversie.
- **Flutter:** goed, maar met Dart moet je een nieuwe taal leren, zonder voordeel boven Expo voor jou.

## Volgorde van bouwen (met Claude Code)

1. **Projectbasis:** zet een Expo-project op en neem `tokens.json` over als thema (donker en licht).
2. **Basisschermen:** bouw Overzicht, Portefeuille en Detail eerst met voorbeelddata (de data uit het prototype).
3. **Beveiliging:** vergrendelscherm met pincode en vingerafdruk.
4. **Server en bronnen:** de Python-server met de bronnen, alleen-lezen: Trading 212, OKX, Trezor-xpub en ING.
5. **Handelen:** handelen via OKX en Trading 212, eerst op een demo- of testaccount.
6. **Overige functies:** alerts, meldingen, periodiek inleggen en herbalanceren.
7. **Afronding:** widgets, de liggende grafiek en de onboarding.

Geef Claude Code per stap het ontwerpbestand en de README mee, met de opdracht om scherm X na te bouwen volgens het ontwerp.

## Let op
- Begin met alleen-lezen API-sleutels. Zet de handelsrechten pas aan als alles betrouwbaar werkt.
- Trading 212 en OKX hebben limieten op het aantal aanvragen. Laat de server koersen bewaren in plaats van ze steeds opnieuw op te vragen.
