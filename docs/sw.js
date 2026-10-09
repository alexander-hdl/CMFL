// Offline cache: stale-while-revalidate for this site and Google Fonts. CACHE changes with every build.
const CACHE = "cmfl-25ccf45409";
const CORE = ["./", "index.html", "trenazhery.html", "plan.html", "komiksy.html", "blokograd.html", "manifest-arena.webmanifest", "manifest-plan.webmanifest", "manifest-comics.webmanifest", "manifest-blok.webmanifest", "manifest-home.webmanifest", "icons/arena-180.png", "icons/arena-192.png", "icons/arena-512.png", "icons/blok-180.png", "icons/blok-192.png", "icons/blok-512.png", "icons/comics-180.png", "icons/comics-192.png", "icons/comics-512.png", "icons/plan-180.png", "icons/plan-192.png", "icons/plan-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cmfl-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const font = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !font) return;
  e.respondWith(caches.open(CACHE).then((cache) => cache.match(req, { ignoreSearch: !font }).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  })));
});
