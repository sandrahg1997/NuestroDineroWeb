import {
  ingestSchema,
  hashToken,
  looksLikeToken,
  MAX_PENDING_PER_HOUSEHOLD,
  normalizeIngest,
  parseIngestDate,
} from "@/lib/ingest";
import { getNotificationPrefs, sendPushToUsers, todayInSpain } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { eur } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Un mismo pago puede llegar dos veces (el atajo se reintenta): se ignora el repetido.
const BURST_WINDOW_MS = 2 * 60 * 1000;

// Recibe un pago desde un Atajo de iOS (automatización "Transacción" de Apple Pay) y
// lo deja en la bandeja de pendientes del hogar. No crea el movimiento: lo confirma
// una persona en /pending. Se autentica con `Authorization: Bearer <token>`.
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!looksLikeToken(token)) return NextResponse.json({ error: "Token no válido" }, { status: 401 });

  const admin = createAdminClient();
  const { data: tokenRow } = await admin
    .from("ingest_tokens")
    .select("id,user_id,household_id")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!tokenRow) return NextResponse.json({ error: "Token no válido" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Faltan datos del pago" }, { status: 400 });
  const payment = normalizeIngest(parsed.data);
  if (!payment) return NextResponse.json({ error: "Importe no válido" }, { status: 422 });

  const today = todayInSpain();
  const date = parseIngestDate(parsed.data.date, today);

  // El token solo vale mientras su dueño siga en el hogar.
  const { data: member } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", tokenRow.household_id)
    .eq("user_id", tokenRow.user_id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Token no válido" }, { status: 401 });

  await admin.from("ingest_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

  const { count } = await admin
    .from("pending_transactions")
    .select("id", { count: "exact", head: true })
    .eq("household_id", tokenRow.household_id);
  if ((count ?? 0) >= MAX_PENDING_PER_HOUSEHOLD)
    return NextResponse.json({ error: "Demasiados pendientes sin revisar" }, { status: 429 });

  const since = new Date(Date.now() - BURST_WINDOW_MS).toISOString();
  const { data: recent } = await admin
    .from("pending_transactions")
    .select("id")
    .eq("household_id", tokenRow.household_id)
    .eq("user_id", tokenRow.user_id)
    .eq("amount", payment.amount)
    .eq("type", payment.type)
    .eq("merchant", payment.merchant)
    .gte("created_at", since)
    .limit(1);
  if (recent?.length) return NextResponse.json({ ok: true, duplicate: true });

  // ¿Ya se apuntó a mano o con el escáner? Mismo importe y día, de cualquiera del hogar.
  const { data: existing } = await admin
    .from("transactions")
    .select("id")
    .eq("household_id", tokenRow.household_id)
    .eq("amount", payment.amount)
    .eq("type", payment.type)
    .eq("date", date)
    .limit(1);

  const { data: created, error } = await admin
    .from("pending_transactions")
    .insert({
      household_id: tokenRow.household_id,
      user_id: tokenRow.user_id,
      merchant: payment.merchant,
      amount: payment.amount,
      type: payment.type,
      date,
      card: payment.card,
      raw_amount: payment.rawAmount,
      possible_duplicate: Boolean(existing?.length),
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("[ingest]", error?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }

  // Aviso al dueño del token. Si falla, el pendiente ya está guardado.
  try {
    const prefs = await getNotificationPrefs(admin, [tokenRow.user_id]);
    await sendPushToUsers(admin, [tokenRow.user_id], (id) => {
      const hide = prefs.get(id)?.hideAmounts ?? false;
      const what = payment.type === "expense" ? "Gasto" : "Devolución";
      const amount = hide ? "" : ` de ${eur.format(payment.amount)}`;
      const where = payment.merchant ? ` en ${payment.merchant}` : "";
      return {
        title: "OurMoney",
        body: `${what}${amount}${where} por confirmar`,
        url: "/pending",
        tag: `pending-${created.id}`,
      };
    });
  } catch (err) {
    console.error("[ingest-push]", (err as Error).message);
  }

  return NextResponse.json({ ok: true, id: created.id });
}
