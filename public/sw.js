// Service worker de OurMoney.
//
// * Sin conexión: guarda cada página que abres (con sus datos) y, si luego no hay
//   red, enseña la última versión guardada. La app avisa con un banner indicando de
//   cuándo son los datos (components/OfflineBanner.tsx). Solo lectura: no se puede
//   guardar nada sin conexión.
// * Los datos viven en Cache Storage de este dispositivo. Se borran al cerrar sesión
//   y al abrir /login (lib/offline.ts → clearOfflineData). Si cambias estos nombres,
//   cámbialos también allí.
// * No se guarda nada de /api, /auth ni de las pantallas de acceso, ni respuestas de
//   Supabase.
// * Muestra las notificaciones push (actividad de la pareja, informes, avisos).

const SHELL = "ourmoney-shell-v3"; // pantalla "Sin conexión" e iconos
const PAGES = "ourmoney-pages-v1"; // páginas vistas, con datos (privado: se borra al salir)
const STATIC = "ourmoney-static-v1"; // JS/CSS con hash de Next (sin datos)
const META = "ourmoney-meta-v1"; // si la última página salió de la caché
const KEEP = [SHELL, PAGES, STATIC, META];

const PRECACHE = ["/offline.html", "/icon-192.png", "/manifest.webmanifest"];
const MAX_PAGES = 40;
const MAX_STATIC = 300;
const STATUS_PATH = "/__ourmoney/offline-status";
const META_KEY = "/__ourmoney/meta";
const CACHED_AT = "x-ourmoney-cached-at";
const NEVER_CACHE = [/^\/login/, /^\/forgot-password/, /^\/reset-password/, /^\/auth\//, /^\/api\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Borra las entradas más antiguas hasta dejar `max` (las claves van por orden de inserción).
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

async function setMeta(value) {
  const cache = await caches.open(META);
  await cache.put(META_KEY, new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }));
}

async function readMeta() {
  const cached = await (await caches.open(META)).match(META_KEY);
  return cached ? cached.json() : { fromCache: false, cachedAt: null };
}

const isCacheablePage = (url, response) =>
  response.ok &&
  response.status === 200 &&
  response.type === "basic" &&
  (response.headers.get("content-type") || "").includes("text/html") &&
  !NEVER_CACHE.some((re) => re.test(url.pathname));

async function storePage(url, response) {
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT, String(Date.now()));
  const copy = new Response(await response.blob(), { status: 200, statusText: "OK", headers });
  const cache = await caches.open(PAGES);
  await cache.put(url.href, copy);
  await trim(PAGES, MAX_PAGES);
}

// Primero la red; si falla (o el servidor está caído), la última versión guardada.
async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);
  const fromCache = async () => {
    const cache = await caches.open(PAGES);
    // Mismo enlace; si no, la misma pantalla con otros parámetros (p. ej. otro periodo).
    const cached = (await cache.match(url.href)) || (await cache.match(url.href, { ignoreSearch: true }));
    if (!cached) return null;
    await setMeta({ fromCache: true, cachedAt: Number(cached.headers.get(CACHED_AT)) || null });
    return cached;
  };

  try {
    const response = await fetch(request);
    if ([502, 503, 504].includes(response.status)) {
      const cached = await fromCache();
      if (cached) return cached;
    }
    if (isCacheablePage(url, response)) event.waitUntil(storePage(url, response.clone()).catch(() => {}));
    event.waitUntil(setMeta({ fromCache: false, cachedAt: null }).catch(() => {}));
    return response;
  } catch {
    const cached = await fromCache();
    if (cached) return cached;
    return (await caches.match("/offline.html")) || Response.error();
  }
}

// Los ficheros de /_next/static llevan hash en el nombre: nunca cambian, así que se
// guardan al verlos. Sin ellos la página guardada se vería pero no funcionaría.
async function handleStatic(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    await trim(STATIC, MAX_STATIC);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === STATUS_PATH) {
    event.respondWith(
      readMeta()
        .catch(() => ({ fromCache: false, cachedAt: null }))
        .then((meta) => new Response(JSON.stringify(meta), { headers: { "content-type": "application/json", "cache-control": "no-store" } })),
    );
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) event.respondWith(handleStatic(request));
});

// Payload que manda lib/push.ts: { title, body, url?, tag? }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "OurMoney", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/dashboard" },
    }),
  );
});

// Al pulsar el aviso: reutiliza una ventana abierta de la app o abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then(() => open.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
