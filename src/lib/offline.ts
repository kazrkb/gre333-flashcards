import { nativeApp } from "@/lib/native";

/**
 * Offline use. Website: the service worker (public/sw.js) keeps the whole app on the device.
 * Android app: everything is built in. Pronunciation uses the device's own voice, so there are
 * no sound files to download.
 */
export const offlineSupported = () => !!nativeApp || ("serviceWorker" in navigator && "caches" in window);

/** Call once at startup: ask the browser never to clear this app's saved data when space runs low. */
export function prepareOffline() {
  if (nativeApp) return;
  navigator.storage?.persist?.().catch(() => {});
}
