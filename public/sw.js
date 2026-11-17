// Service worker: makes the app open instantly and work fully offline.
// - Page (index.html): served from cache right away, refreshed in the background. A new version of the
//   page is only stored once all the code files it needs are cached, so the app always opens offline.
// - Code files (/assets, hashed names), including lazily loaded ones: cached up front, cache first.
// - Word recordings (/audio): kept in their own cache, which survives app updates. The app downloads
//   all of them in the background (src/lib/offline.ts); range requests from audio players are answered
//   from the full cached file.
// - /api requests: never cached (the app keeps its own offline copy of progress and syncs it later).
const CACHE = "gre333-v5"; // v5: full offline support
const AUDIO_CACHE = "gre-audio-v1"; // keep in sync with src/lib/offline.ts; bump only if recordings change
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
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== AUDIO_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Code files a page needs: the ones it links, plus chunks those files load later (e.g. the Word Smart list). */
async function assetsFor(html, cache) {
  const found = new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]));
  for (const url of [...found]) {
    if (!url.endsWith(".js")) continue;
    const res = (await cache.match(url)) ?? (await fetch(url));
    if (!res.ok) continue;
    const js = await res.clone().text();
    for (const m of js.matchAll(/["'`]\.\/([\w.-]+\.(?:js|css))["'`]/g)) found.add(`/assets/${m[1]}`);
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

/** Word recording: from the audio cache (downloading the whole file if needed), honouring Range requests. */
async function audio(request) {
  const url = new URL(request.url).pathname;
  const cache = await caches.open(AUDIO_CACHE);
  let res = await cache.match(url);
  if (!res) {
    res = await fetch(url); // whole file, no Range header, so it can be cached
    if (!res.ok) return res;
    await cache.put(url, res.clone());
  }
  const range = request.headers.get("range");
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return res;
  const buf = await res.arrayBuffer();
  const size = buf.byteLength;
  let start = m[1] === "" ? size - Number(m[2]) : Number(m[1]);
  let end = m[1] === "" || m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  start = Math.max(0, start);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // always live
    if (url.pathname.endsWith(".apk")) return; // Android app download: straight from the server, never cached
    if (url.pathname.startsWith("/audio/")) {
      event.respondWith(audio(request).catch(() => new Response("Offline", { status: 503 })));
      return;
    }
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
