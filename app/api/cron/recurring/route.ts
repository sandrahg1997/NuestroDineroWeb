import { buildRecurringReminder, type ReminderItem } from "@/lib/recurring";
import { getNotificationPrefs, pushConfigured, sendPushToUsers, todayInSpain } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKey } from "@/lib/utils";
import { addDays, parseISO } from "date-fns";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Cron diario de Vercel (ver vercel.json). Genera los movimientos recurrentes
// vencidos de todos los hogares. Vercel manda automáticamente la cabecera
// `Authorization: Bearer <CRON_SECRET>` cuando la variable CRON_SECRET existe.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_all_due_recurring");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Los avisos van en este mismo cron (el plan de Vercel limita cuántos hay).
  // Si fallan, los movimientos ya se han generado: no se devuelve error.
  let reminded = 0;
  try {
    reminded = await sendRecurringReminders(admin);
  } catch (err) {
    console.error("[recurring-reminders]", (err as Error).message);
  }

  return NextResponse.json({ ok: true, generated: data ?? 0, reminded });
}

// Avisa a los miembros de cada hogar de los recurrentes que se cobran mañana.
async function sendRecurringReminders(admin: SupabaseClient) {
  if (!pushConfigured()) return 0;
  const tomorrow = dateKey(addDays(parseISO(todayInSpain()), 1));

  const { data: due } = await admin
    .from("recurring_transactions")
    .select("household_id,concept,amount,type")
    .eq("is_active", true)
    .eq("next_date", tomorrow);
  if (!due?.length) return 0;

  const itemsByHousehold = new Map<string, ReminderItem[]>();
  for (const r of due) {
    const items = itemsByHousehold.get(r.household_id) ?? [];
    items.push({ concept: r.concept, amount: Number(r.amount), type: r.type });
    itemsByHousehold.set(r.household_id, items);
  }

  const { data: members } = await admin
    .from("household_members")
    .select("household_id,user_id")
    .in("household_id", [...itemsByHousehold.keys()]);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
  if (!userIds.length) return 0;

  const prefs = await getNotificationPrefs(admin, userIds);
  // Consulta aparte: si la migración aún no está aplicada, falla sola y cuenta como "sí".
  const { data: optOut } = await admin
    .from("user_preferences")
    .select("user_id")
    .in("user_id", userIds)
    .eq("notify_recurring_reminder", false);
  const muted = new Set((optOut ?? []).map((p) => p.user_id as string));

  let sent = 0;
  for (const [householdId, items] of itemsByHousehold) {
    const users = (members ?? [])
      .filter((m) => m.household_id === householdId && !muted.has(m.user_id))
      .map((m) => m.user_id as string);
    sent += await sendPushToUsers(admin, users, (id) => {
      const reminder = buildRecurringReminder(items, prefs.get(id)?.hideAmounts ?? false);
      return reminder ? { ...reminder, url: "/recurring", tag: `recurring-${householdId}-${tomorrow}` } : null;
    });
  }
  return sent;
}
