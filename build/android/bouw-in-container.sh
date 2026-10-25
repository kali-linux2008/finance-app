#!/usr/bin/env bash
# Draait in de bouwcontainer: kopieert de app, maakt het Android-project en bouwt de APK.
set -euo pipefail

echo "1/4 Bestanden kopiëren…"
rm -rf /work && mkdir -p /work
cd /src/app
tar --exclude=./node_modules --exclude=./android --exclude=./.expo -cf - . | tar -xf - -C /work
cd /work

# Versienummer = minuten sinds 1970: elke nieuwe bouw is hoger, zodat de app ziet dat er een update is.
VERSION_CODE=$(( $(date +%s) / 60 ))
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("app.json"));j.expo.android.versionCode=Number(process.argv[1]);fs.writeFileSync("app.json",JSON.stringify(j,null,2))' "$VERSION_CODE"

echo "2/4 Onderdelen installeren (npm)…"
npm ci --no-audit --no-fund --loglevel=error

echo "3/4 Android-project maken…"
CI=1 npx expo prebuild --platform android --clean --no-install

# Eigen ondertekensleutel, één keer gemaakt en bewaard in het Docker-volume meridian-bouw-cache.
# Android installeert een update alleen als die met dezelfde sleutel is ondertekend.
KEYSTORE=/cache/meridian.keystore
if [ ! -f "$KEYSTORE" ]; then
  echo "Eigen ondertekensleutel maken (eenmalig)…"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Meridian, O=Jarno, C=NL" >/dev/null
  chmod 600 "$KEYSTORE"
fi
cp "$KEYSTORE" android/app/debug.keystore

echo "4/4 App bouwen (de eerste keer duurt dit 10–20 minuten)…"
cd android
# Zuinig met geheugen, zodat het ook op een server met weinig RAM lukt:
# - alleen voor moderne telefoons (arm64) bouwen in plaats van vier processortypes;
# - Kotlin in hetzelfde proces compileren (geen extra Kotlin-daemon);
# - hooguit $WORKERS taken tegelijk;
# - geen R8-verkleining: die haalde onderdelen weg die de achtergrondtaak (WorkManager) nodig
#   heeft, waardoor de app bij het openen crashte. Bovendien was het de traagste stap.
WORKERS="${MERIDIAN_BOUW_WORKERS:-2}"
./gradlew assembleRelease --no-daemon --console=plain --max-workers="$WORKERS" \
  -Dorg.gradle.jvmargs="-Xmx${MERIDIAN_BOUW_GEHEUGEN:-2g} -XX:MaxMetaspaceSize=768m -XX:+HeapDumpOnOutOfMemoryError" \
  -Dorg.gradle.parallel=false \
  -PreactNativeArchitectures=arm64-v8a \
  -Pkotlin.compiler.execution.strategy=in-process \
  -Pandroid.enableMinifyInReleaseBuilds=false \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=false

# Eerst de APK, daarna pas versie.json: zo biedt de server nooit een half gekopieerde app aan.
cp app/build/outputs/apk/release/app-release.apk /out/meridian.apk.tmp
chmod 644 /out/meridian.apk.tmp
mv /out/meridian.apk.tmp /out/meridian.apk
SHA=$(sha256sum /out/meridian.apk | cut -d' ' -f1)
VERSION=$(node -p 'require("/work/app.json").expo.version')
printf '{"versionCode": %s, "version": "%s", "built": %s, "sha256": "%s"}\n' "$VERSION_CODE" "$VERSION" "$(date +%s)" "$SHA" > /out/versie.json.tmp
chmod 644 /out/versie.json.tmp
mv /out/versie.json.tmp /out/versie.json
echo "Klaar: meridian.apk (versie $VERSION_CODE)"
