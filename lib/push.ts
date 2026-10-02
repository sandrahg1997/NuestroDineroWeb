import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Solo servidor. Las claves VAPID se generan una vez con `npx web-push generate-vapid-keys`
// (ver README). La pública también la usa el navegador para suscribirse.

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

let configured = false;

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function setup() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:soporte@ourmoney.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

// Envía a todos los dispositivos de cada usuario el payload que devuelva
// `payloadFor` (null = no enviar a ese usuario). `admin` debe ser el cliente con
// service_role. Borra las suscripciones caducadas (404/410). Devuelve cuántos
// avisos se entregaron.
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payloadFor: (userId: string) => PushPayload | null
) {
  if (!pushConfigured() || !userIds.length) return 0;
  setup();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", userIds);

  const expired: string[] = [];
  const results = await Promise.all(
    (subs ?? []).map(async (s) => {
      const payload = payloadFor(s.user_id);
      if (!payload) return false;
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 }
        );
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
        else console.error("[push] envío fallido", status, (err as Error).message);
        return false;
      }
    })
  );

  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return results.filter(Boolean).length;
}

type NotificationPrefs = {
  user_id: string;
  notify_partner_activity?: boolean | null;
  notify_weekly_report?: boolean | null;
  hide_amounts?: boolean | null;
};

// Preferencias de aviso de varios usuarios. Sin fila (o columnas aún sin migrar)
// cuenta como "sí a todo" y "importes visibles".
export async function getNotificationPrefs(admin: SupabaseClient, userIds: string[]) {
  const { data } = await admin
    .from("user_preferences")
    .select("user_id,notify_partner_activity,notify_weekly_report,hide_amounts")
    .in("user_id", userIds);
  const map = new Map<string, { partnerActivity: boolean; weeklyReport: boolean; hideAmounts: boolean }>();
  for (const id of userIds) map.set(id, { partnerActivity: true, weeklyReport: true, hideAmounts: false });
  for (const p of (data ?? []) as NotificationPrefs[]) {
    map.set(p.user_id, {
      partnerActivity: p.notify_partner_activity !== false,
      weeklyReport: p.notify_weekly_report !== false,
      hideAmounts: p.hide_amounts === true,
    });
  }
  return map;
}

// Hoy en hora de España: el servidor (Vercel) va en UTC.
export function todayInSpain(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
}
