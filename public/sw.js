// Service worker mínimo de OurMoney.
// Solo aporta una pantalla "Sin conexión" cuando falla una navegación.
// NO cachea datos ni respuestas de API/Supabase para no mostrar nunca
// información financiera desactualizada.

const CACHE = "ourmoney-shell-v1";
const PRECACHE = ["/offline.html", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
});
