# Play Store build (Trusted Web Activity)

The Android app is a thin wrapper that opens https://gre333-flashcards.onrender.com full screen.
Website updates reach the app automatically. Rebuild only to change the app's name, icon, colours or version.

- Settings: `twa-manifest.json` (package `com.onrender.gre333_flashcards.twa`, can never change)
- Build tools: `Dockerfile` (JDK 17, Android SDK, Bubblewrap), amd64 image
- Upload signing key: `../../android-signing/` (outside the repo; never commit it). Back it up.
- `public/.well-known/assetlinks.json` must list the SHA-256 of the upload key **and** of Google's
  app signing key (Play Console → App integrity), or the app shows a browser address bar.

## Rebuild

1. Bump `appVersionCode` (+1) and `appVersionName` in `twa-manifest.json`.
2. From `android/`:

```sh
docker build -t twa-build .
P=$(sed -n 's/^Password (keystore and key): //p' ../../android-signing/PASSWORD.txt)
docker run --rm -v "$PWD":/work -v twa-gradle:/root/.gradle \
  -v /Users/rakib/Downloads/GRE333/android-signing:/keys:ro \
  -e BUBBLEWRAP_KEYSTORE_PASSWORD="$P" -e BUBBLEWRAP_KEY_PASSWORD="$P" \
  twa-build sh -c 'bubblewrap update --skipVersionUpgrade && bubblewrap build --skipPwaValidation'
```

Output: `app-release-bundle.aab` (upload to Play) and `app-release-signed.apk` (install directly).
