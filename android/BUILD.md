# GRE Words Android app

A plain WebView app with the **whole web app built in**: code, words, fonts and all 1,735 word
recordings. It needs no internet to open or work. Only progress sync (`/api/...`) uses the network.

- The built web app (`dist/`) is copied to `app/src/main/assets/www` and served at
  `https://gre333-flashcards.onrender.com/`, so the page and its saved data live at the real site
  address and `/api` calls go to the real server.
- Progress is saved on the phone (WebView storage) and synced to the cloud when online.
- **Reinstall restores progress:** the app links a SHA-256 hash of the phone's per-app Android ID to
  the sync code (`/api/devices/<hash>`). The ID stays the same across reinstalls (same signing key);
  it changes only after a factory reset. A sync code still moves progress to another phone.
- Package `com.onrender.gre333_flashcards.twa` (kept from the first release; it can never change).
- Signing key: `../../android-signing/` (outside the repo; never commit it). Back it up. Android
  refuses to update an installed app that is signed with a different key.

## Release a new version

Content and feature changes reach the app only through a new APK.

1. Bump `versionCode` (+1) and `versionName` in `app/build.gradle`.
2. Run `./build.sh` (needs Docker). It builds the web app, then the APK, and copies it to
   `public/GRE-Words.apk`.
3. Set the same numbers in `APP_VERSION` in `backend/app/main.py`, so installed apps show the
   "new version available" banner.
4. Commit and push. Users download from https://gre333-flashcards.onrender.com/GRE-Words.apk.
