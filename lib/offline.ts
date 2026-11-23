// Apoyo al modo sin conexión (public/sw.js). Los nombres de caché y la ruta de estado
// tienen que coincidir con los del service worker.

export const OFFLINE_STATUS_PATH = "/__ourmoney/offline-status";
const PRIVATE_CACHES = ["ourmoney-pages-v1", "ourmoney-meta-v1"];

export type OfflineStatus = { fromCache: boolean; cachedAt: number | null };

// Borra las páginas guardadas en este dispositivo (llevan datos financieros). Se llama
// al cerrar sesión y al abrir /login, para que quien entre después no vea lo anterior.
export async function clearOfflineData() {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => PRIVATE_CACHES.includes(k)).map((k) => caches.delete(k)));
  } catch {
    // sin soporte o bloqueado: no pasa nada
  }
}

// "hace 5 min", "hace 3 h", "hace 2 días". Devuelve "" si no hay fecha.
export function timeAgo(from: number | null, now = Date.now()) {
  if (!from) return "";
  const minutes = Math.max(0, Math.round((now - from) / 60_000));
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}
