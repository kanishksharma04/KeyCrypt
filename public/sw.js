// KeyCrypt service worker: caches the app shell so the installed app can open
// the read-only offline vault (/offline) without a network.
//
// - /_next/static/* (hashed, immutable): cache first.
// - Page navigations: network first; offline, they go to the cached /offline
//   page (a redirect, so the URL and the page always match).
// - /offline and its assets are cached at install and refreshed whenever an
//   online vault page asks for it ("cache-offline-shell").
// No API responses, server actions or vault data are cached here; the
// encrypted vault itself lives in IndexedDB (src/features/vault/offline-cache.ts).

const SHELL_CACHE = "keycrypt-shell-v1";
const STATIC_CACHE = "keycrypt-static-v1";
const OFFLINE_URL = "/offline";

async function cacheShell() {
  const response = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) return;
  const html = await response.clone().text();
  await (await caches.open(SHELL_CACHE)).put(OFFLINE_URL, response);
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    assets.add(match[1].replace(/&amp;/g, "&"));
  }
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...assets].map(async (url) => {
      if (await cache.match(url)) return;
      try {
        await cache.add(url);
      } catch {
        // a missing asset only matters offline
      }
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== SHELL_CACHE && name !== STATIC_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "cache-offline-shell") {
    event.waitUntil(cacheShell().catch(() => {}));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })()
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          if (url.pathname === OFFLINE_URL) {
            const cached = await caches.match(OFFLINE_URL);
            if (cached) return cached;
            return Response.error();
          }
          return Response.redirect(OFFLINE_URL, 302);
        }
      })()
    );
  }
});
