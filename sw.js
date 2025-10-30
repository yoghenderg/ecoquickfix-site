// ---- EcoQuickFix Service Worker (v3) ----
const STATIC_CACHE = "ecoqf-static-v3";
const RUNTIME_CACHE = "ecoqf-runtime-v3";

const STATIC_ASSETS = [
  "/",                 // home
  "/index.html",
  "/offline.html",
  // Add your real static files if you want them precached:
  // "/assets/css/styles.css",
  // NOTE: Do NOT precache JS app logic (e.g., /assets/js/user.js) to avoid stale logic.
  // It will be fetched network-first below.
  // "/assets/img/client-logo.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/maskable-512.png"
  ,"/assets/img/placeholder.png"
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

  const url = new URL(req.url);

  // HARD-IGNORE admin so PWA doesn't touch it
  if (url.pathname.startsWith("/admin")) return;

  // NEW: Ignore Firestore and Firebase Auth API calls to prevent caching issues
  if (url.origin.includes("firestore.googleapis.com") || url.origin.includes("identitytoolkit.googleapis.com")) {
    return; // Let network handle it fully, no caching
  }

  // Determine request type
  const accept = req.headers.get("accept") || "";
  const isHTML = accept.includes("text/html");
  const isCode = req.destination === "script" || req.destination === "style";

  // Network-first for HTML and for JS/CSS (keeps logic/styles fresh)
  if (isHTML || isCode) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || (isHTML ? caches.match("/offline.html") : undefined)))
    );
    return;
  }

  // Everything else (images/fonts/etc): cache-first for speed
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => {
        // fallback for images if offline and not cached
        if (req.destination === "image") {
          return caches.match("/assets/img/placeholder.png");
        }
      });
    })
  );
});