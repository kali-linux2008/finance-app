#!/usr/bin/env bash
# Draait in de bouwcontainer: kopieert de app, maakt het Android-project en bouwt de APK.
set -euo pipefail

echo "1/4 Bestanden kopiëren…"
rm -rf /work && mkdir -p /work
cd /src/app
tar --exclude=./node_modules --exclude=./android --exclude=./.expo -cf - . | tar -xf - -C /work
cd /work

echo "2/4 Onderdelen installeren (npm)…"
npm ci --no-audit --no-fund --loglevel=error

echo "3/4 Android-project maken…"
CI=1 npx expo prebuild --platform android --clean --no-install

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

cp app/build/outputs/apk/release/app-release.apk /out/meridian.apk
chmod 644 /out/meridian.apk
echo "Klaar: meridian.apk"
