# De Meridian-app met pushmeldingen

Pushmeldingen (bijv. "Inleg gelukt: € 375 belegd") werken niet in Expo Go: Expo heeft dat op Android uitgezet. Daarom bouw je één keer een eigen Meridian-app (een APK) die je op je telefoon installeert. Dat bouwen gebeurt gratis in de cloud bij Expo; je pc hoeft geen Android-software te hebben.

Je hebt nodig: een gratis **Expo-account** en een gratis **Firebase-project** van Google (Firebase bezorgt de meldingen op Android). Reken op een half uur, waarvan een kwartier wachten.

> **Twee bestanden van Firebase, verschillend geheim:**
> - `google-services.json`: hoort in de app, mag in git.
> - de **serviceaccount-sleutel** (`...-firebase-adminsdk-....json`): **geheim**. Alleen uploaden naar Expo (stap 4), nooit in git, nooit naar mij sturen.

## 1. Expo-account en de bouwhulp

1. Maak een account op [expo.dev](https://expo.dev/signup).
2. In PowerShell:
   ```powershell
   npm install -g eas-cli
   eas login
   ```

## 2. De app koppelen aan je Expo-account

```powershell
cd $HOME\Documents\finance-app
git pull
cd app
npm install
eas init
```

Kies **Create a new project** als hij dat vraagt. `eas init` zet een `projectId` in `app.json`. Zet die wijziging op GitHub:

```powershell
git add app.json
git commit -m "Expo-project gekoppeld"
git push
```

## 3. Firebase-project en google-services.json

1. Ga naar [console.firebase.google.com](https://console.firebase.google.com) → **Project toevoegen** → naam bijv. `meridian` (Google Analytics mag uit).
2. Klik op het **Android-icoon** om een app toe te voegen. Package name: **`nl.jarno.meridian`** (precies zo). De rest mag leeg.
3. Download **google-services.json** en zet hem in de map `finance-app\app` (naast `app.json`). De volgende stappen in Firebase (SDK toevoegen) kun je overslaan.
4. Zet hem op GitHub:
   ```powershell
   git add google-services.json
   git commit -m "Firebase-instellingen voor meldingen"
   git push
   ```

## 4. Expo toestemming geven om meldingen te sturen

1. In Firebase: tandwiel → **Projectinstellingen** → tab **Serviceaccounts** → **Nieuwe privésleutel genereren**. Je downloadt een JSON-bestand. Dit is de **geheime** sleutel.
2. In PowerShell (in de map `app`):
   ```powershell
   eas credentials -p android
   ```
   Kies het profiel **apk** → **Google Service Account** → **Manage your Google Service Account Key for Push Notifications (FCM V1)** → **Set up** / **Upload** → kies het gedownloade bestand.
3. Verwijder dat bestand daarna uit je Downloads (of bewaar het ergens veilig). Expo heeft het nu.

## 5. De app bouwen

```powershell
eas build -p android --profile apk
```

Vraagt hij om een **keystore** te maken: kies **Yes** (Expo bewaart hem voor je). Het bouwen duurt 10 à 20 minuten. Daarna krijg je een link en een QR-code.

## 6. Installeren op je telefoon

1. Open de link (of scan de QR-code) **op je telefoon** en download de APK.
2. Open het bestand. Android vraagt of je apps uit deze bron wilt toestaan: **Toestaan**, en daarna **Installeren**.
3. Open **Meridian**. Dit is een nieuwe app naast Expo Go, dus:
   - kies opnieuw een **pincode**;
   - koppel opnieuw je server: op de server `docker compose exec meridian python -m meridian koppelcode`, in de app **JV → Server**.

## 7. Meldingen aanzetten en testen

1. In de app: **JV (Meer) → Meldingen** aanzetten en toestemming geven.
2. Op de server:
   ```bash
   docker compose exec meridian python -m meridian melding test
   ```
   Binnen een paar seconden krijg je "Testmelding: meldingen werken."

Vanaf nu krijg je na elke periodieke inleg een melding, ook als de app dicht is.

## Later bijwerken

Na een nieuwe stap bouw je de app opnieuw met `eas build -p android --profile apk` en installeer je de nieuwe APK over de oude heen (je pincode en koppeling blijven bewaard). Voor dagelijks ontwikkelen kun je Expo Go gewoon blijven gebruiken; alleen meldingen werken daar niet.

## Problemen

| Probleem | Oplossing |
|---|---|
| "Deze app is nog niet gekoppeld aan Expo" | Stap 2 (`eas init`) is niet gedaan of de wijziging in `app.json` zat niet in de build. |
| Testmelding verstuurd naar 0 telefoons | De serviceaccount-sleutel is niet (goed) geüpload (stap 4), of `google-services.json` hoort bij een ander Firebase-project. |
| "Server niet bereikbaar" in de nieuwe app | Zelfde wifi of Tailscale aan? Adres met `:8000` erachter? |
| Geen melding, wel "verstuurd naar 1" | Android-instellingen → Apps → Meridian → Meldingen aan; batterijbesparing voor Meridian uitzetten. |
