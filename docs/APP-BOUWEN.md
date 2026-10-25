# De Meridian-app zelf bouwen (op je eigen server)

Zolang je Expo Go gebruikt, werkt Meridian prima, maar meldingen komen dan alleen binnen als de app open is. Met een eigen Meridian-app (een APK) kijkt de app ook op de achtergrond bij je server, ongeveer elk kwartier, en krijg je een melding als de app dicht is.

Je bouwt die app op je eigen Ubuntu-server, in Docker. Geen Expo-account, geen Google-account, geen andere app op je telefoon.

> **Nodig op de server:** ongeveer **6 GB vrije schijfruimte** en **4 GB vrij geheugen** tijdens het bouwen. De eerste keer duurt het 15 à 30 minuten (er wordt veel gedownload); daarna een paar minuten.

## 1. Bouwen

```bash
cd ~/finance-app && git pull
./build/android/bouw.sh
```

Aan het eind staat er: `De app staat klaar: /home/jarno/finance-app/out/meridian.apk`.

## 2. Op je telefoon zetten

1. Op de server, tijdelijk een downloadpagina starten:
   ```bash
   python3 -m http.server 8080 --directory ~/finance-app/out
   ```
2. Open op je telefoon in Chrome: `http://192.168.2.24:8080/meridian.apk` (of via Tailscale `http://100.73.31.66:8080/meridian.apk`).
3. Open het gedownloade bestand. Android vraagt of Chrome apps mag installeren: **Toestaan**, daarna **Installeren**. Play Protect kan waarschuwen omdat de app niet uit de Play Store komt: kies **Toch installeren**.
4. Stop de downloadpagina op de server met **Ctrl + C**.

## 3. De app instellen

De Meridian-app is een nieuwe app naast Expo Go, dus:

1. Kies een **pincode** (en vingerafdruk).
2. Koppel je server: op de server `docker compose exec meridian python -m meridian koppelcode`, in de app **JV → Server** met adres `100.73.31.66:8000`.
3. **JV → Meldingen** aanzetten en toestemming geven.
4. Zet de batterijbesparing voor Meridian uit: Android-instellingen → Apps → Meridian → Batterij → **Onbeperkt**. Anders kan Android de achtergrondcontrole lang uitstellen.

## 4. Testen

```bash
cd ~/finance-app/server
docker compose exec meridian python -m meridian melding test
```

Open je Meridian, dan zie je de melding meteen (en bij het belletje rechtsboven). Doe je de app dicht, dan komt een volgende testmelding binnen ongeveer een kwartier tot een half uur; Android bepaalt het precieze moment.

## Later bijwerken (update in de app)

Na een nieuwe versie bouw je alleen op de server:

```bash
cd ~/finance-app && git pull
cd server && docker compose up -d --build && cd ..   # de server zelf ook bijwerken
MERIDIAN_BOUW_WORKERS=1 ./build/android/bouw.sh
```

Zodra de bouw klaar is, ziet de app dat er een nieuwe versie is:

- je krijgt een melding **Nieuwe app-versie**;
- op het overzicht staat een balk **Nieuwe app-versie klaar**, en onder **Meer → App-versie** zie je welke versie je hebt.

Tik op **Updaten**: de app downloadt de nieuwe versie bij je server en Android vraagt **Bijwerken?** Je pincode, koppeling en instellingen blijven bewaard. Geen downloadpagina of browser nodig.

De eerste keer vraagt Android of Meridian apps mag installeren: tik op **Instellingen**, zet **Toestaan van deze bron** aan, ga terug en tik nog een keer op **Updaten**.

De server biedt de app alleen aan gekoppelde telefoons aan. Android installeert een update alleen als hij met dezelfde sleutel is ondertekend als de app die al op je telefoon staat.

## Widgets op je startscherm

Houd je vinger op een lege plek van je startscherm → **Widgets** → **Meridian**. Er zijn vier formaten:

- **Meridian · belegd** (4×2): totaal, dagverandering, grafiek van vandaag en de drie grootste bewegers;
- **Meridian · totaal** (2×2): totaal met grafiek;
- **Meridian · FIRE-doel** (2×2): voortgang naar € 500k;
- **Meridian · smal** (4×1): totaal en dagverandering op één regel.

Tik op een widget om Meridian te openen. Ze worden bijgewerkt als je de app opent, ongeveer elk kwartier op de achtergrond (als Meldingen aan staat) en anders minstens elk half uur. Met privacymodus aan tonen ze `€ ••••`. Kan de server even niet bereikt worden, dan zie je de laatste stand.

## Weinig geheugen? Swap toevoegen

Swap is extra "geheugen" op de schijf. Langzamer, maar het voorkomt dat het bouwen wordt afgebroken. Eenmalig:

```bash
free -h                                   # kijk hoeveel geheugen en swap er is
sudo fallocate -l 6G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # blijft na herstart
```

Bestaat `/swapfile` al, sla dit dan over (of kijk met `swapon --show`).

## Goed om te weten

- De app wordt alleen gebouwd voor moderne telefoons (64-bit ARM, vrijwel alle Android-telefoons sinds 2017). Dat scheelt geheugen en tijd.
- De app wordt ondertekend met een eigen sleutel die de eerste bouw maakt en bewaart in het Docker-volume `meridian-bouw-cache` (`meridian.keystore`). Raak je die kwijt (bijvoorbeeld door `docker volume rm`), dan moet je de app één keer verwijderen en opnieuw installeren. Reservekopie maken:
  ```bash
  docker run --rm -v meridian-bouw-cache:/c -v ~/:/b alpine cp /c/meridian.keystore /b/meridian.keystore
  ```
  Bewaar die kopie goed en zet hem nooit in git.
- Expo Go blijft werken voor als je wilt meekijken tijdens het ontwikkelen.

## Problemen

| Probleem | Oplossing |
|---|---|
| Bouwen stopt met "Killed", "out of memory" of "daemon disappeared unexpectedly" | Te weinig geheugen. Voeg swap toe (zie hieronder) en probeer opnieuw. Nog steeds niet? `MERIDIAN_BOUW_WORKERS=1 ./build/android/bouw.sh`. |
| "No space left on device" | Ruim oude Docker-onderdelen op: `docker system prune` (je Meridian-gegevens blijven, die staan in een volume). |
| Telefoon kan het bestand niet downloaden | Staat de downloadpagina nog aan? Zelfde wifi of Tailscale aan? Firewall: `sudo ufw allow from 192.168.0.0/16 to any port 8080`. |
| "App niet geïnstalleerd" of "conflicteert met een bestaand pakket" bij bijwerken | De app is met een andere sleutel ondertekend (bijvoorbeeld de allereerste versie, of de sleutel is weg). Verwijder de oude Meridian-app eenmalig en installeer via stap 2 (daarna opnieuw koppelen). |
| Geen balk "Nieuwe app-versie" na het bouwen | Server bijgewerkt (`docker compose up -d --build`)? Trek op het overzicht omlaag om te verversen. |
| App sluit direct na openen | Bouw opnieuw met de nieuwste versie (`git pull`). Zie je het nog steeds, lees dan de foutmelding uit met `adb logcat -d -b crash` (zie hieronder). |
| Meldingen komen laat of niet bij een dichte app | Batterijbesparing op Onbeperkt (stap 3.4). Open de app één keer na het installeren. |

## Foutmelding van de app uitlezen (via je server)

Crasht de app, dan staat de reden in het logboek van je telefoon. Dat lees je draadloos uit via de server (Android 11 of nieuwer):

1. Telefoon: Instellingen → Ontwikkelaarsopties → **Draadloze foutopsporing** aan → **Apparaat koppelen met koppelingscode**.
2. Server: `sudo apt install -y adb`, dan `adb pair <ip>:<poort>` met de code, en `adb connect <ip>:<andere poort>` (staat op het scherm Draadloze foutopsporing).
3. Open de app (hij crasht) en typ: `adb logcat -d -b crash | tail -80`.
4. Zet Draadloze foutopsporing daarna weer uit.
