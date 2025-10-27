// ---- EcoQuickFix Service Worker (v1) ----
const STATIC_CACHE = "ecoqf-static-v1";
const RUNTIME_CACHE = "ecoqf-runtime-v1";

const STATIC_ASSETS = [
  "/",                 // home
  "/index.html",
  "/offline.html",
  // Add your real static files if you want them precached:
  // "/assets/css/styles.css",
  // "/assets/js/user.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Only GET
  if (req.method !== "GET") return;

  // HARD-IGNORE admin so PWA doesn't touch it
  const url = new URL(req.url);
  if (url.pathname.startsWith("/admin")) return;

  // HTML: network-first (fresh content, offline fallback)
  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");
  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("/offline.html")))
    );
    return;
  }

  // Assets: cache-first
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});