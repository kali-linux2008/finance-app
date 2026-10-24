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
./gradlew assembleRelease --no-daemon --console=plain -Dorg.gradle.jvmargs="-Xmx3g -XX:MaxMetaspaceSize=1g"

cp app/build/outputs/apk/release/app-release.apk /out/meridian.apk
chmod 644 /out/meridian.apk
echo "Klaar: meridian.apk"
