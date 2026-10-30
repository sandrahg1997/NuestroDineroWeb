"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Bell, BellOff, LoaderCircle, Send } from "lucide-react";
import { useToast } from "./Toast";

type Support = "checking" | "ok" | "unsupported" | "ios-install" | "not-configured";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// La Push API pide la clave pública como bytes, no en base64url.
function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function getRegistration() {
  // En desarrollo ServiceWorkerRegister no registra el SW; aquí sí, para poder probar.
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export default function NotificationSettings({
  partnerActivity: initialPartnerActivity,
  weeklyReport: initialWeeklyReport,
  recurringReminder: initialRecurringReminder,
}: {
  partnerActivity: boolean;
  weeklyReport: boolean;
  recurringReminder: boolean;
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefs, setPrefs] = useState({
    partnerActivity: initialPartnerActivity,
    weeklyReport: initialWeeklyReport,
    recurringReminder: initialRecurringReminder,
  });
  const { toast } = useToast();

  useEffect(() => {
    if (!VAPID_PUBLIC_KEY) return setSupport("not-configured");
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    // En iPhone las notificaciones web solo existen con la app instalada.
    if (isIos && !standalone) return setSupport("ios-install");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
      return setSupport("unsupported");
    setSupport("ok");
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast("Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta web.", "error");
        return;
      }
      const reg = await getRegistration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) {
        const message = (await res.json().catch(() => null))?.error;
        throw new Error(message ?? `No se pudo activar (error ${res.status} del servidor).`);
      }
      setSubscribed(true);
      toast("Notificaciones activadas en este dispositivo", "success");
    } catch (err) {
      toast((err as Error).message || "No se pudieron activar las notificaciones.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      toast("No se pudieron desactivar las notificaciones. Inténtalo de nuevo.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs(change: Partial<typeof prefs>) {
    if (savingPrefs) return;
    const prev = prefs;
    const next = { ...prefs, ...change };
    setPrefs(next);
    setSavingPrefs(true);
    const s = createClient();
    const { error } = await s.rpc("set_notification_prefs", {
      p_partner_activity: next.partnerActivity,
      p_weekly_report: next.weeklyReport,
      p_recurring_reminder: next.recurringReminder,
    });
    if (error) {
      setPrefs(prev);
      toast(error.message, "error");
    }
    setSavingPrefs(false);
  }

  async function sendTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) toast(body?.error ?? "No se pudo enviar la prueba.", "error");
      else if (!body?.sent) toast("No hay ningún dispositivo con avisos activados.", "error");
    } catch {
      toast("Sin conexión. Inténtalo de nuevo.", "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card">
      <h2>
        <Bell size={20} /> Notificaciones
      </h2>
      <p className="subtitle">Avisos en el móvil aunque no tengas la app abierta.</p>

      {support === "checking" && <LoaderCircle size={18} className="spin" />}
      {support === "not-configured" && (
        <p className="subtitle">Falta configurar las claves de notificaciones en el servidor (ver README).</p>
      )}
      {support === "unsupported" && <p className="subtitle">Este navegador no admite notificaciones web.</p>}
      {support === "ios-install" && (
        <p className="subtitle">
          En iPhone, primero instala la app: en Safari pulsa Compartir → «Añadir a pantalla de inicio», ábrela desde ahí
          y vuelve a esta pantalla.
        </p>
      )}

      {support === "ok" && (
        <>
          <div className="toolbar" style={{ marginTop: 12, justifyContent: "flex-start" }}>
            {subscribed ? (
              <>
                <button type="button" className="btn btn-soft" onClick={disable} disabled={busy}>
                  {busy ? <LoaderCircle size={16} className="spin" /> : <BellOff size={16} />}
                  Desactivar en este dispositivo
                </button>
                <button type="button" className="btn btn-ghost" onClick={sendTest} disabled={testing}>
                  {testing ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
                  Enviar prueba
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="spin" /> : <Bell size={16} />}
                Activar en este dispositivo
              </button>
            )}
          </div>

          <div className="notify-options">
            <label className="notify-option">
              <input
                type="checkbox"
                checked={prefs.partnerActivity}
                disabled={savingPrefs}
                onChange={(e) => savePrefs({ partnerActivity: e.target.checked })}
              />
              <span>
                <strong>Actividad de tu pareja</strong>
                <small>«Nacho ha añadido un gasto de 60 € en Mercadona»</small>
              </span>
            </label>
            <label className="notify-option">
              <input
                type="checkbox"
                checked={prefs.weeklyReport}
                disabled={savingPrefs}
                onChange={(e) => savePrefs({ weeklyReport: e.target.checked })}
              />
              <span>
                <strong>Informe semanal</strong>
                <small>Los domingos por la tarde: gasto de la semana, presupuesto y retos.</small>
              </span>
            </label>
            <label className="notify-option">
              <input
                type="checkbox"
                checked={prefs.recurringReminder}
                disabled={savingPrefs}
                onChange={(e) => savePrefs({ recurringReminder: e.target.checked })}
              />
              <span>
                <strong>Próximos cobros recurrentes</strong>
                <small>«Mañana se cobra la hipoteca (850 €)», la mañana de antes.</small>
              </span>
            </label>
          </div>
          <p className="subtitle" style={{ fontSize: 12 }}>
            Si tienes activado «Ocultar importes», los avisos no muestran cifras.
          </p>
        </>
      )}
    </div>
  );
}
