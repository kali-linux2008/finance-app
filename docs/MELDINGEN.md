# Meldingen op je telefoon (helemaal lokaal)

Meridian stuurt meldingen via **ntfy**: een kleine meldingsdienst die op je eigen server draait, naast Meridian. Op je telefoon installeer je de gratis **ntfy-app**; die houdt verbinding met jouw server en laat de meldingen zien, ook als Meridian dicht is.

Geen Google, geen Expo-account, geen cloud: alles blijft in je eigen netwerk (thuis-wifi of Tailscale).

```
Meridian-server ──► ntfy (op je server, poort 8090) ──► ntfy-app op je telefoon
```

Je krijgt bijvoorbeeld een melding na elke periodieke inleg ("Inleg gelukt: € 375,00 belegd" of "Inleg niet gelukt: te weinig saldo").

> **Veilig houden:** zet poort 8090 net als 8000 **nooit** open naar internet. Gebruik Tailscale als je buiten je wifi bent.

## 1. Server bijwerken (ntfy start dan mee)

```bash
cd ~/finance-app && git pull
cd server && docker compose up -d --build
docker compose ps
```

Je ziet nu twee containers: `meridian` en `ntfy`.

## 2. Je geheime onderwerp opvragen

```bash
docker compose exec meridian python -m meridian melding
```

Je krijgt een onderwerp zoals `meridian-Xk3...`. Dat is een lange geheime naam: wie hem niet kent, ziet je meldingen niet. Deel hem niet.

## 3. De ntfy-app instellen

1. Installeer **ntfy** uit de Play Store (of F-Droid).
2. Tik op **+** (abonneren).
3. Vul bij **Topic** je onderwerp uit stap 2 in.
4. Vink **Use another server** aan en vul in: `http://100.73.31.66:8090` (je Tailscale-adres) of thuis `http://192.168.2.24:8090`. Met het Tailscale-adres werkt het overal, mits Tailscale aan staat op je telefoon.
5. Tik op **Subscribe**.

Android vraagt mogelijk of ntfy op de achtergrond mag blijven draaien en meldingen mag tonen: **toestaan**. Zet voor ntfy de batterijbesparing uit (Instellingen → Apps → ntfy → Batterij → Onbeperkt), anders kan Android de verbinding verbreken.

## 4. Testen

```bash
docker compose exec meridian python -m meridian melding test
```

Binnen een paar seconden zie je "Testmelding: meldingen werken."

## Problemen

| Probleem | Oplossing |
|---|---|
| "Mislukt: ntfy niet bereikbaar" | Draait hij? `docker compose ps`. Zo niet: `docker compose up -d`. |
| Testmelding verstuurd, maar niets op je telefoon | Onderwerp precies goed overgenomen? Serveradres met `http://` en `:8090`? Tailscale aan op je telefoon? |
| De ntfy-app kan de server niet bereiken | Staat er een firewall aan op de server? Dan: `sudo ufw allow from 192.168.0.0/16 to any port 8090` en `sudo ufw allow in on tailscale0 to any port 8090`. |
| Meldingen komen pas laat | Batterijbesparing voor ntfy uitzetten (zie stap 3). |
| Onderwerp per ongeluk gedeeld | `python -m meridian melding nieuw` geeft een nieuw onderwerp; pas het daarna aan in de ntfy-app. |
