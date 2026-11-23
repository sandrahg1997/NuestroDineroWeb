"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { OFFLINE_STATUS_PATH, timeAgo, type OfflineStatus } from "@/lib/offline";

// Aviso fijo arriba cuando la página que ves es una copia guardada (sin conexión) o
// cuando se pierde la conexión con la página abierta.
export default function OfflineBanner() {
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  // Empieza en true (como el servidor) y se corrige al montar: evita desajustes de hidratación.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // Pregunta al service worker si esta página salió de su copia guardada.
    fetch(OFFLINE_STATUS_PATH, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<OfflineStatus>) : null))
      .then((s) => s && typeof s.fromCache === "boolean" && setStatus(s))
      .catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const stale = status?.fromCache === true;
  if (online && !stale) return null;

  return (
    <div className="offline-banner" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span>
        {stale
          ? `${online ? "Ya hay conexión. " : "Sin conexión. "}Estás viendo datos guardados ${timeAgo(status?.cachedAt ?? null)}.`
          : "Sin conexión. Los cambios no se guardarán hasta que vuelva."}
        {stale && !online && " No se pueden guardar cambios."}
      </span>
      {stale && online && (
        <button type="button" className="offline-banner-action" onClick={() => location.reload()}>
          Actualizar
        </button>
      )}
    </div>
  );
}
