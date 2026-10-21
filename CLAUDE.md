# Meridian — instructies voor Claude Code

Persoonlijke vermogens- en beleggingsapp voor Android (Nederlands, EUR). Gebruiker: Jarno, die nog weinig ervaring heeft met programmeren. Leg keuzes kort en in gewone taal uit.

## Bronnen
- `docs/HANDOFF.md`: alle schermen, interacties en gedrag. Dit is leidend.
- `docs/tokens.json`: kleuren, typografie, ruimte, radii en beweging. Gebruik deze waarden exact.
- `docs/ADVIES-STACK.md`: de gekozen stack en de bouwvolgorde.
- `design/Vermogen App v4.dc.html`: het klikbare prototype. Lees de code om exacte layouts en de voorbeelddata over te nemen.
- `design/Vermogen Extras.dc.html`: app-icoon, opstartscherm, widgets, meldingen en de liggende grafiek.

## Stack
- `app/`: Expo (React Native) met TypeScript, alleen Android.
- `server/`: Python met FastAPI voor de sync, koersalerts en pushmeldingen.

## Werkwijze
- Bouw in de volgorde van ADVIES-STACK.md, één stap tegelijk. Laat na elke stap zien hoe Jarno het op zijn telefoon test (Expo Go of een development build).
- Begin met de voorbeelddata uit het prototype en koppel daarna pas de echte API's.
- Gebruik voor API-sleutels eerst alleen-lezen-rechten. Bewaar ze versleuteld op de server, nooit in de app of in git.
- Test handelen eerst op een demo- of testaccount (OKX demo, Trading 212 practice).
- Zet geheimen in `.env`; die staat al in `.gitignore`.
- Maak na elke afgeronde stap een commit met een duidelijke Nederlandse omschrijving.
