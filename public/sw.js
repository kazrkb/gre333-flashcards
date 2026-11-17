// Service worker: makes the app open instantly and work offline.
// - Page (index.html): served from cache right away, refreshed in the background.
// - Built assets (hashed file names) and fonts: cache first.
// - /api requests: never cached (the app keeps its own offline copy of progress).
const CACHE = "gre333-v4"; // v4: real files (app download, privacy page) bypass the app shell
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheKey) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey ?? request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(cacheKey ?? request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? new Response("Offline", { status: 503 });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // always live
    if (url.pathname.endsWith(".apk")) return; // Android app download: straight from the server, never cached
    // Links to real files (privacy.html etc.) load the file itself, not the app.
    if (request.mode === "navigate" && /\.[a-z0-9]+$/i.test(url.pathname)) return;
    if (request.mode === "navigate") {
      event.respondWith(staleWhileRevalidate(request, "/"));
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(request));
      return;
    }
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
  }
});
