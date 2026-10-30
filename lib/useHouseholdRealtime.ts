"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// Escucha los avisos de cambios del hogar (ver supabase/migrations/2026-10-30-realtime.sql)
// y llama a onChange. Agrupa las ráfagas (p. ej. una importación de Excel, que
// inserta muchas filas) en una sola llamada.
export function useHouseholdRealtime(householdId: string | null, onChange: () => void, delay = 600) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });

  useEffect(() => {
    if (!householdId) return;
    const s = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof s.channel> | null = null;
    let cancelled = false;
    // El canal es privado: hay que mandar el token de la sesión antes de suscribirse.
    s.realtime
      .setAuth()
      .then(() => {
        if (cancelled) return;
        channel = s
          .channel(`household:${householdId}`, { config: { private: true } })
          .on("broadcast", { event: "change" }, () => {
            clearTimeout(timer);
            timer = setTimeout(() => callback.current(), delay);
          })
          .subscribe();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) s.removeChannel(channel);
    };
  }, [householdId, delay]);
}
