const CACHE = "flowforge-shell-v2";
const SHELL = ["/", "/index.html", "/favicon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/download/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((res) => {
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return res;
    })),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "flowforge-reminders") return;
  // Reminders are scheduled by the page; SW acknowledges for future push upgrades.
});
