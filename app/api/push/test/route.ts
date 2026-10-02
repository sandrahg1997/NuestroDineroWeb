import { pushConfigured, sendPushToUsers } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Botón "Enviar prueba" de Ajustes: manda un aviso a los dispositivos propios.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!pushConfigured())
    return NextResponse.json({ error: "Las notificaciones no están configuradas en el servidor." }, { status: 503 });

  const sent = await sendPushToUsers(createAdminClient(), [user.id], () => ({
    title: "OurMoney",
    body: "¡Listo! Así te llegarán los avisos de la app 🔔",
    url: "/settings",
    tag: "test",
  }));
  return NextResponse.json({ ok: true, sent });
}
