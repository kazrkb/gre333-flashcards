// Service worker: makes the app open instantly and work fully offline.
// - Page (index.html): served from cache right away, refreshed in the background. A new version of the
//   page is only stored once all the code files it needs are cached, so the app always opens offline.
// - Code files (/assets, hashed names), including lazily loaded ones: cached up front, cache first.
// - /api requests: never cached (the app keeps its own offline copy of progress and syncs it later).
const CACHE = "gre333-v7"; // v7: no recordings (device voice); old sound cache removed
const SHELL = ["/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      const page = await fetch("/", { cache: "no-store" });
      if (page.ok) await storePage(cache, page);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Code files a page needs: the ones it links, plus chunks those files load later (e.g. the Word Smart list). */
async function assetsFor(html, cache) {
  const found = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
  for (const url of [...found]) {
    const isJs = url.endsWith(".js");
    if (!isJs && !url.endsWith(".css")) continue;
    const res = (await cache.match(url)) ?? (await fetch(url));
    if (!res.ok) continue;
    const text = await res.clone().text();
    if (isJs) for (const m of text.matchAll(/["'`]\.\/([\w.-]+\.(?:js|css))["'`]/g)) found.add(`/assets/${m[1]}`);
    // Bundled fonts (woff2 is what every current browser uses).
    else for (const m of text.matchAll(/url\((\/assets\/[\w.-]+\.woff2)\)/g)) found.add(m[1]);
  }
  return [...found];
}

/** Save a new version of the page, but only after every code file it needs is cached; drop old code files. */
async function storePage(cache, response) {
  const html = await response.clone().text();
  const needed = await assetsFor(html, cache);
  for (const url of needed) {
    if (!(await cache.match(url))) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`could not cache ${url}`);
      await cache.put(url, res);
    }
  }
  await cache.put("/", response);
  const keep = new Set(needed);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/assets/") && !keep.has(path)) await cache.delete(req);
  }
}

async function page(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match("/");
  // Refresh the stored page in the background; never make the user wait for it.
  const network = fetch(event.request)
    .then((res) => ({ res, copy: res.ok ? res.clone() : null }))
    .catch(() => null);
  event.waitUntil(network.then((n) => (n?.copy ? storePage(cache, n.copy).catch(() => {}) : undefined)));
  if (cached) return cached;
  const n = await network;
  return n?.res ?? new Response("You're offline. Connect to the internet once to set up the app.", { status: 503 });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // always live
    if (url.pathname.endsWith(".apk")) return; // Android app download: straight from the server, never cached
    if (request.mode === "navigate") {
      // Links to real files (privacy.html etc.) load the file itself, not the app.
      if (/\.[a-z0-9]+$/i.test(url.pathname)) return;
      event.respondWith(page(event));
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
