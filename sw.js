/* Q Berries Calidad — Service Worker · todo local en caché */
const CACHE = "qb-calidad-v79";
const ASSETS = [
  "./",
  "./index.html",
  "./css/fonts.css",
  "./css/styles.css",
  "./js/config.js",
  "./js/data.js",
  "./js/scoring.js",
  "./js/select.js",
  "./js/datepicker.js",
  "./js/api.js",
  "./js/app.js",
  "./manifest.json",
  "./assets/logo-qberries.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/apple-touch-icon.png",
  "./data/lotes-licapa.json",
  "./data/trabajadores.json",
  "./data/supervisores-cosecha.json",
  "./fonts/plus-jakarta-sans-500.woff2",
  "./fonts/plus-jakarta-sans-600.woff2",
  "./fonts/plus-jakarta-sans-700.woff2",
  "./fonts/plus-jakarta-sans-800.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Solo mismo origen — Google Sheets POST no se cachea
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Caché primero (offline total). Si hay red, actualiza en segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
