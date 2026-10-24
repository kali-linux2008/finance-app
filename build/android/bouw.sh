#!/usr/bin/env bash
# Bouwt de Meridian-app (APK) op deze server, in Docker. Gebruik: ./build/android/bouw.sh
# De APK komt in ~/finance-app/out/meridian.apk. Geen account nodig.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p out

docker build -t meridian-bouwer build/android
docker run --rm \
  -v "$PWD":/src:ro \
  -v "$PWD/out":/out \
  -v meridian-bouw-cache:/cache \
  -v meridian-android-sdk:/opt/android-sdk \
  meridian-bouwer

echo
echo "De app staat klaar: $PWD/out/meridian.apk"
echo "Op je telefoon downloaden: draai  python3 -m http.server 8080 --directory $PWD/out"
echo "en open op je telefoon  http://<adres-van-deze-server>:8080/meridian.apk  (daarna Ctrl+C)."
