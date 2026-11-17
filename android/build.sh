#!/bin/sh
# Build the Android app with the whole web app built in. Run from anywhere; needs Docker.
# Output: android/GRE-Words.apk (also copied to public/GRE-Words.apk for the website download).
set -e
cd "$(dirname "$0")"
KEYS="${KEYS:-$(cd ../.. && pwd)/android-signing}"
PASS=$(sed -n 's/^Password (keystore and key): //p' "$KEYS/PASSWORD.txt")

# 1. Web app → assets/www (without files the app doesn't need)
(cd .. && npm run build >/dev/null)
rm -rf app/src/main/assets/www && mkdir -p app/src/main/assets
cp -R ../dist app/src/main/assets/www
rm -f app/src/main/assets/www/GRE-Words.apk app/src/main/assets/www/sw.js app/src/main/assets/www/devices.html

# 2. Android build (amd64 image; Gradle downloads cached in the twa-gradle volume)
docker build -q -t gre-android . >/dev/null
docker run --rm -v "$PWD":/work -v twa-gradle:/root/.gradle -v "$KEYS":/keys:ro \
  -e KEY_PASSWORD="$PASS" gre-android ./gradlew --no-daemon -q assembleRelease

cp app/build/outputs/apk/release/app-release.apk GRE-Words.apk
cp GRE-Words.apk ../public/GRE-Words.apk
ls -la GRE-Words.apk
