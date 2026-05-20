/* Simple PWA Service Worker for GitHub Pages + Vite
 * - Cache-first for same-origin GET requests
 * - Pre-caches app shell files
 * - Runtime-caches fetched assets (including JSON question banks)
 *
 * IMPORTANT: When you update files/question-bank, bump VERSION.
 */

const VERSION = "v1";
const CACHE_NAME = `sachkunde-trainer-${VERSION}`;

// GitHub Pages path prefix: derived from SW scope (e.g. '/<repo>/' )
const BASE = self.registration.scope; // ends with '/'

const PRECACHE_URLS = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.webmanifest`,
  `${BASE}logo.png`
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("sachkunde-trainer-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== "basic") return res;
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
          return res;
        })
        .catch(() => {
          if (req.mode === "navigate") return caches.match(`${BASE}index.html`);
          return cached;
        });
    })
  );
});
