# Meldingen

Meridian laat je dingen weten: of je periodieke inleg gelukt is, een koersalert die afgaat (zie [SERVER.md](SERVER.md), stap 9) en een nieuwe app-versie. Alles blijft lokaal: de app haalt de meldingen zelf op bij je eigen server. Geen Google, geen Expo-account, geen andere app.

- **In de app:** het belletje rechtsboven op Overzicht, met een stip als er iets nieuws is.
- **Als melding op je telefoon:** zet ze aan via **JV → Meldingen**.
  - In **Expo Go**: alleen terwijl Meridian open is (of net op de achtergrond staat).
  - In de **eigen Meridian-app**: ook als de app dicht is, ongeveer elk kwartier. Die app bouw je op je eigen server: zie [APP-BOUWEN.md](APP-BOUWEN.md).

Testen op de server:

```bash
docker compose exec meridian python -m meridian melding test
```

Laatste meldingen bekijken: `docker compose exec meridian python -m meridian melding`.

## Soorten meldingen

| Soort | Wanneer |
|---|---|
| Inleg | na elke periodieke inleg (altijd aan) |
| Koersalerts | als een koers je doel raakt (zie SERVER.md, stap 9) |
| Dividend ontvangen | nieuw dividend op Trading 212 (de server kijkt elke 6 uur) |
| Doel-mijlpalen | bij elke 10% van je FIRE-doel (standaard € 500.000) |
| Weekoverzicht | zondag 18:00: hoeveel je vermogen deze week veranderde |
| Rabo-CSV | wekelijkse herinnering om een CSV-bestand te sturen (zondag 10:00) |
| Nieuwe app-versie | als er een nieuwe app klaarstaat |

Aan- of uitzetten en het doel aanpassen:

```bash
docker compose exec meridian python -m meridian melding soorten                # bekijken
docker compose exec meridian python -m meridian melding soorten week uit       # weekoverzicht uit
docker compose exec meridian python -m meridian melding soorten dividend aan
docker compose exec meridian python -m meridian melding soorten doel 750000    # FIRE-doel
```

Dividend vraagt bij Trading 212 een sleutel met het leesrecht **History** (Dividends). Heeft je leessleutel dat niet, dan slaat de server dividend gewoon over. Bij de eerste keer onthoudt de server alleen welke dividenden er al waren; daarna meldt hij alleen nieuwe.
