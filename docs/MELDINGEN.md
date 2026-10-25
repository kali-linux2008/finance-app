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
