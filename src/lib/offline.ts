import { useSyncExternalStore } from "react";
import PRON from "@/data/pron.json";

/**
 * Full offline use: keep this device's data from being cleared, and download every word recording
 * in the background (the service worker stores them; see public/sw.js). Resumes after interruptions.
 */
const AUDIO_CACHE = "gre-audio-v1"; // keep in sync with public/sw.js
const IDS = Object.keys(PRON);

export type OfflineState = {
  status: "unsupported" | "waiting" | "downloading" | "paused" | "ready";
  done: number;
  total: number;
};

let state: OfflineState = { status: "waiting", done: 0, total: IDS.length };
const listeners = new Set<() => void>();
const set = (s: Partial<OfflineState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

export function useOfflineState() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}

let running = false;
async function downloadSounds() {
  if (running) return;
  running = true;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const missing = IDS.filter((id) => !have.has(`/audio/m/${encodeURIComponent(id)}.mp3`));
    set({ done: IDS.length - missing.length });
    if (!missing.length) return set({ status: "ready" });
    set({ status: "downloading" });
    let next = 0;
    let failed = false;
    const worker = async () => {
      while (next < missing.length && !failed) {
        const id = missing[next++];
        try {
          // The service worker saves the whole file in the audio cache as it passes through.
          const res = await fetch(`/audio/m/${encodeURIComponent(id)}.mp3`);
          if (!res.ok) throw new Error(String(res.status));
          await res.arrayBuffer();
          set({ done: state.done + 1 });
        } catch {
          failed = true; // offline or server asleep: stop and resume later
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    set({ status: failed ? "paused" : "ready" });
  } catch {
    set({ status: "paused" });
  } finally {
    running = false;
  }
}

/** Call once at startup (production only). */
export function prepareOffline() {
  if (!("serviceWorker" in navigator) || !("caches" in window)) return set({ status: "unsupported" });
  // Ask the browser to never clear this app's saved data when the phone runs low on space.
  navigator.storage?.persist?.().catch(() => {});

  const start = () => {
    if (!navigator.serviceWorker.controller) return; // the worker starts controlling on the next event
    if (navigator.onLine) void downloadSounds();
    else set({ status: "paused" });
  };
  navigator.serviceWorker.addEventListener("controllerchange", start);
  window.addEventListener("online", start);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.status === "paused") start();
  });
  // Let the app finish loading first.
  window.setTimeout(start, 4000);
}
