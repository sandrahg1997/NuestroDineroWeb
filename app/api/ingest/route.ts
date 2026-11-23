import {
  dayRange,
  findAutoRule,
  hashToken,
  ingestSchema,
  isLikelyDuplicate,
  looksLikeToken,
  MAX_PENDING_PER_HOUSEHOLD,
  normalizeIngest,
  parseIngestDate,
} from "@/lib/ingest";
import { aliasKey, cleanMerchant } from "@/lib/merchant";
import { getNotificationPrefs, sendPushToUsers, todayInSpain } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { eur } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Un mismo pago puede llegar dos veces (el atajo se reintenta): se ignora el repetido.
const BURST_WINDOW_MS = 2 * 60 * 1000;
// Fallos que se conservan por hogar: los más antiguos se borran.
const MAX_FAILURES = 20;

type Admin = ReturnType<typeof createAdminClient>;
type TokenRow = { id: string; user_id: string; household_id: string };

// Guarda un pago que no se pudo leer y avisa a quien lo mandó, para que no se
// pierda en silencio (Atajos no enseña los errores del servidor). Todo va con
// tolerancia: si la tabla aún no existe, el endpoint responde igual.
async function recordFailure(admin: Admin, token: TokenRow, reason: string, body: unknown) {
  try {
    const raw = (typeof body === "string" ? body : JSON.stringify(body ?? null)).slice(0, 300);
    const { error } = await admin
      .from("ingest_failures")
      .insert({ household_id: token.household_id, user_id: token.user_id, reason, raw });
    if (error) return;
    const { data: old } = await admin
      .from("ingest_failures")
      .select("id")
      .eq("household_id", token.household_id)
      .order("created_at", { ascending: false })
      .range(MAX_FAILURES, MAX_FAILURES + 50);
    if (old?.length)
      await admin
        .from("ingest_failures")
        .delete()
        .in(
          "id",
          old.map((r) => r.id)
        );
    await sendPushToUsers(admin, [token.user_id], () => ({
      title: "OurMoney",
      body: "No se pudo leer un pago con Apple Pay. Añádelo a mano.",
      url: "/pending",
      tag: `ingest-failure-${token.id}`,
    }));
  } catch (err) {
    console.error("[ingest-failure]", (err as Error).message);
  }
}

// Recibe un pago desde un Atajo de iOS (automatización "Transacción" de Apple Pay).
// Lo normal es dejarlo en la bandeja de pendientes del hogar, para que una persona lo
// confirme en /pending. Si el comercio tiene una regla de "guardar sin preguntar", se
// crea el movimiento directamente. Se autentica con `Authorization: Bearer <token>`.
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

  // El token solo vale mientras su dueño siga en el hogar.
  const { data: member } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", tokenRow.household_id)
    .eq("user_id", tokenRow.user_id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Token no válido" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    await recordFailure(admin, tokenRow, "Faltan datos del pago", body);
    return NextResponse.json({ error: "Faltan datos del pago" }, { status: 400 });
  }
  const payment = normalizeIngest(parsed.data);
  if (!payment) {
    await recordFailure(admin, tokenRow, "No se encontró un importe válido", body);
    return NextResponse.json({ error: "Importe no válido" }, { status: 422 });
  }

  const date = parseIngestDate(parsed.data.date, todayInSpain());

  // Nombre legible: primero lo que ya habéis renombrado a mano; si no, una limpieza
  // automática. El nombre original se guarda aparte para poder recordar el cambio.
  const rawMerchant = payment.merchant;
  if (rawMerchant) {
    // Si la tabla aún no existe (migración sin aplicar), falla y se usa solo la limpieza.
    const { data: alias } = await admin
      .from("merchant_aliases")
      .select("name")
      .eq("household_id", tokenRow.household_id)
      .eq("key", aliasKey(rawMerchant))
      .maybeSingle();
    payment.merchant = alias?.name || cleanMerchant(rawMerchant);
  }

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

  // ¿Ya se apuntó a mano o con el escáner? Mismo importe, tipo y día (±1) y, además,
  // mismo comercio: dos tiendas distintas con igual importe no son un duplicado.
  const [from, to] = dayRange(date);
  const { data: candidates } = await admin
    .from("transactions")
    .select("merchant,concept")
    .eq("household_id", tokenRow.household_id)
    .eq("amount", payment.amount)
    .eq("type", payment.type)
    .gte("date", from)
    .lte("date", to)
    .limit(20);
  const possibleDuplicate = isLikelyDuplicate(payment.merchant, candidates ?? []);

  // Guardado automático: solo gastos de un comercio con regla, y nunca si parece repetido.
  if (payment.type === "expense" && !possibleDuplicate && payment.merchant) {
    // Si la columna aún no existe (migración sin aplicar), la consulta falla y no hay reglas.
    const { data: rules } = await admin
      .from("merchant_category_rules")
      .select("merchant_pattern,category_id")
      .eq("household_id", tokenRow.household_id)
      .eq("auto_confirm", true);
    const rule = findAutoRule(payment.merchant, rules ?? []);
    if (rule) {
      const { data: tx } = await admin
        .from("transactions")
        .insert({
          household_id: tokenRow.household_id,
          user_id: tokenRow.user_id,
          concept: payment.merchant,
          merchant: payment.merchant,
          amount: payment.amount,
          date,
          category_id: rule.category_id,
          type: payment.type,
          note: "Apple Pay (automático)",
        })
        .select("id")
        .single();
      if (tx) {
        await notifyAuto(admin, tokenRow, payment, tx.id);
        return NextResponse.json({ ok: true, auto: true, id: tx.id });
      }
    }
  }

  const pendingRow = {
    household_id: tokenRow.household_id,
    user_id: tokenRow.user_id,
    merchant: payment.merchant,
    amount: payment.amount,
    type: payment.type,
    date,
    card: payment.card,
    raw_amount: payment.rawAmount,
    possible_duplicate: possibleDuplicate,
  };
  let { data: created, error } = await admin
    .from("pending_transactions")
    .insert({ ...pendingRow, raw_merchant: rawMerchant })
    .select("id")
    .single();
  // Sin la migración de nombres, la columna no existe: se guarda igual sin ella.
  if (error)
    ({ data: created, error } = await admin.from("pending_transactions").insert(pendingRow).select("id").single());
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

// Un gasto guardado solo: se avisa a la otra persona como cualquier gasto nuevo
// (respetando su preferencia) y a quien pagó se le confirma que ya está apuntado.
async function notifyAuto(admin: Admin, token: TokenRow, payment: { amount: number; merchant: string }, txId: string) {
  try {
    await admin
      .from("transactions")
      .update({ activity_notified_at: new Date().toISOString() })
      .eq("id", txId)
      .is("activity_notified_at", null);
    const { data: members } = await admin
      .from("household_members")
      .select("user_id")
      .eq("household_id", token.household_id);
    const ids = (members ?? []).map((m) => m.user_id as string);
    const prefs = await getNotificationPrefs(admin, ids);
    await sendPushToUsers(admin, ids, (id) => {
      const p = prefs.get(id);
      const isPayer = id === token.user_id;
      if (!isPayer && !p?.partnerActivity) return null;
      const amount = p?.hideAmounts ? "" : ` de ${eur.format(payment.amount)}`;
      return {
        title: "OurMoney",
        body: isPayer
          ? `Guardado${amount} en ${payment.merchant}`
          : `Se ha añadido un gasto${amount} en ${payment.merchant}`,
        url: "/transactions",
        tag: `tx-${txId}`,
      };
    });
  } catch (err) {
    console.error("[ingest-auto-push]", (err as Error).message);
  }
}
