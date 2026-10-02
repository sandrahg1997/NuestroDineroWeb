import { challengeProgress, type Challenge } from "@/lib/challenges";
import { computePeriodSummary } from "@/lib/period-summary";
import { getNotificationPrefs, pushConfigured, sendPushToUsers, todayInSpain } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateKey } from "@/lib/utils";
import { buildWeeklyReport } from "@/lib/weekly-report";
import { addDays, parseISO } from "date-fns";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type WeekTx = {
  date: string;
  type: "expense" | "income";
  amount: number | string;
  concept: string;
  merchant: string;
  category_id: string | null;
  recurring_id: string | null;
  category: { name?: string } | null;
};

// Cron semanal de Vercel (domingo por la tarde, ver vercel.json). Manda a cada
// persona con avisos activados un resumen de la semana de su espacio activo.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!pushConfigured()) return NextResponse.json({ ok: true, sent: 0, skipped: "push no configurado" });

  const admin = createAdminClient();
  const today = todayInSpain();
  const weekStart = dateKey(addDays(parseISO(today), -6));
  const prevStart = dateKey(addDays(parseISO(today), -13));

  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  if (!userIds.length) return NextResponse.json({ ok: true, sent: 0 });

  const prefs = await getNotificationPrefs(admin, userIds);
  const wanted = userIds.filter((id) => prefs.get(id)?.weeklyReport);
  if (!wanted.length) return NextResponse.json({ ok: true, sent: 0 });

  // Espacio de cada persona: el activo o, si no tiene, el más antiguo.
  const [{ data: memberships }, { data: activePrefs }] = await Promise.all([
    admin.from("household_members").select("household_id,user_id,created_at").in("user_id", wanted).order("created_at"),
    admin.from("user_preferences").select("user_id,active_household_id").in("user_id", wanted),
  ]);
  const activeOf = new Map(
    (activePrefs ?? []).map((p) => [p.user_id as string, p.active_household_id as string | null])
  );
  const usersByHousehold = new Map<string, string[]>();
  for (const id of wanted) {
    const mine = (memberships ?? []).filter((m) => m.user_id === id);
    const preferred = activeOf.get(id);
    const householdId = mine.find((m) => m.household_id === preferred)?.household_id ?? mine[0]?.household_id;
    if (!householdId) continue;
    usersByHousehold.set(householdId, [...(usersByHousehold.get(householdId) ?? []), id]);
  }

  let sent = 0;
  for (const [householdId, members] of usersByHousehold) {
    try {
      const [{ data: household }, { data: tx }, { data: challenges }] = await Promise.all([
        admin
          .from("households")
          .select("name,active_period:periods!households_active_period_id_fkey(id,start_date,end_date)")
          .eq("id", householdId)
          .maybeSingle(),
        admin
          .from("transactions")
          .select("date,type,amount,concept,merchant,category_id,recurring_id,category:categories(name)")
          .eq("household_id", householdId)
          .gte("date", prevStart)
          .lte("date", today),
        admin
          .from("challenges")
          .select("*")
          .eq("household_id", householdId)
          .lte("start_date", today)
          .gte("end_date", today),
      ]);

      const rows = (tx ?? []) as unknown as WeekTx[];
      const expenses = rows.filter((r) => r.type === "expense");
      const week = expenses.filter((r) => r.date >= weekStart);
      const weekExpense = week.reduce((t, r) => t + Number(r.amount), 0);
      const previousWeekExpense = expenses.filter((r) => r.date < weekStart).reduce((t, r) => t + Number(r.amount), 0);

      const byCat = new Map<string, number>();
      for (const r of week) {
        const name = r.category?.name ?? "Sin categoría";
        byCat.set(name, (byCat.get(name) ?? 0) + Number(r.amount));
      }
      const top = [...byCat].sort((a, b) => b[1] - a[1])[0];

      const period = household?.active_period as unknown as { id: string; start_date: string; end_date: string } | null;
      let budget: { spent: number; amount: number } | undefined;
      if (period && today >= period.start_date && today <= period.end_date) {
        const summary = await computePeriodSummary(admin, householdId, period.start_date, period.end_date, period.id);
        if (summary.budgetTotal > 0) budget = { spent: summary.budgetSpent, amount: summary.budgetTotal };
      }

      // Para la racha basta con los movimientos desde el inicio de cada reto.
      const challengeRows = await Promise.all(
        ((challenges ?? []) as Challenge[]).map(async (c) => {
          const { data: ctx } = await admin
            .from("transactions")
            .select("date,type,amount,concept,merchant,category_id,recurring_id")
            .eq("household_id", householdId)
            .eq("type", "expense")
            .gte("date", c.start_date)
            .lte("date", today);
          return { title: c.title, icon: c.icon, progress: challengeProgress(c, (ctx ?? []) as WeekTx[], today) };
        })
      );

      sent += await sendPushToUsers(admin, members, (id) => {
        const report = buildWeeklyReport({
          householdName: (household?.name as string) ?? "Nuestro hogar",
          weekExpense,
          previousWeekExpense,
          topCategory: top ? { name: top[0], value: top[1] } : undefined,
          budget,
          challenges: challengeRows,
          hideAmounts: prefs.get(id)?.hideAmounts ?? false,
        });
        return report ? { ...report, url: "/dashboard", tag: `weekly-${today}` } : null;
      });
    } catch (err) {
      console.error("[weekly-report]", householdId, (err as Error).message);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
