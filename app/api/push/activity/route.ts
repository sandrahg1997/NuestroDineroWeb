import { getNotificationPrefs, sendPushToUsers } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { eur } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Solo se avisa de movimientos recién creados, no de ediciones ni de antiguos.
const MAX_AGE_MS = 10 * 60 * 1000;

// La app lo llama justo después de crear un movimiento. Avisa al resto de
// miembros del espacio: "Nacho ha añadido un gasto de 60,00 € en Mercadona".
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { transactionId?: unknown } | null;
  if (typeof body?.transactionId !== "string")
    return NextResponse.json({ error: "Falta el movimiento" }, { status: 400 });

  // Con la sesión del usuario: RLS garantiza que es de un espacio suyo.
  const { data: tx } = await supabase
    .from("transactions")
    .select("id,household_id,user_id,type,amount,concept,merchant,created_at")
    .eq("id", body.transactionId)
    .maybeSingle();
  if (!tx || tx.user_id !== user.id) return NextResponse.json({ ok: true, sent: 0 });
  if (Date.now() - new Date(tx.created_at).getTime() > MAX_AGE_MS) return NextResponse.json({ ok: true, sent: 0 });

  const admin = createAdminClient();

  // Reclama el aviso de forma atómica: si ya se avisó, no se repite.
  const { data: claimed, error: claimError } = await admin
    .from("transactions")
    .update({ activity_notified_at: new Date().toISOString() })
    .eq("id", tx.id)
    .is("activity_notified_at", null)
    .select("id");
  if (claimError || !claimed?.length) return NextResponse.json({ ok: true, sent: 0 });

  const { data: members } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", tx.household_id)
    .neq("user_id", user.id);
  const partnerIds = (members ?? []).map((m) => m.user_id as string);
  if (!partnerIds.length) return NextResponse.json({ ok: true, sent: 0 });

  const prefs = await getNotificationPrefs(admin, partnerIds);
  const name =
    (user.user_metadata?.display_name as string | undefined)?.trim() || user.email?.split("@")[0] || "Tu pareja";
  const what = tx.type === "expense" ? "un gasto" : "un ingreso";
  const where = tx.merchant?.trim() ? ` en ${tx.merchant.trim()}` : tx.concept?.trim() ? `: ${tx.concept.trim()}` : "";

  const sent = await sendPushToUsers(admin, partnerIds, (id) => {
    const p = prefs.get(id);
    if (!p?.partnerActivity) return null;
    const amount = p.hideAmounts ? "" : ` de ${eur.format(Number(tx.amount))}`;
    return {
      title: "OurMoney",
      body: `${name} ha añadido ${what}${amount}${where}`,
      url: "/transactions",
      tag: `tx-${tx.id}`,
    };
  });

  return NextResponse.json({ ok: true, sent });
}
