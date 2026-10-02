import AppShell from "@/components/AppShell";
import ChallengeManager from "@/components/ChallengeManager";
import PageHeader from "@/components/PageHeader";
import { BASELINE_DAYS, baselineDaily, challengeProgress, challengeStreak, type Challenge } from "@/lib/challenges";
import { getSessionContext } from "@/lib/data";
import type { Category } from "@/lib/types";
import { dateKey } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function RetosPage() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const today = dateKey();
  const [{ data: challengeData }, { data: categories }] = await Promise.all([
    supabase
      .from("challenges")
      .select("*")
      .eq("household_id", householdId)
      .order("start_date", { ascending: false })
      .limit(60),
    supabase.from("categories").select("*").eq("household_id", householdId).eq("type", "expense").order("name"),
  ]);
  const challenges = (challengeData ?? []) as Challenge[];

  // Movimientos desde 8 semanas antes del reto más antiguo, para la línea base
  // ("lo que habríais gastado") de cada reto.
  let txs: any[] = [];
  if (challenges.length) {
    const oldest = challenges[challenges.length - 1].start_date;
    const from = new Date(`${oldest}T12:00:00`);
    from.setDate(from.getDate() - BASELINE_DAYS);
    const { data } = await supabase
      .from("transactions")
      .select("type,amount,date,concept,merchant,category_id,recurring_id")
      .eq("household_id", householdId)
      .eq("type", "expense")
      .gte("date", dateKey(from))
      .lte("date", today);
    txs = data ?? [];
  }

  const items = challenges.map((c) => ({
    challenge: c,
    progress: challengeProgress(c, txs, today, baselineDaily(c, txs)),
  }));
  const { streak, won } = challengeStreak(
    items.map((i) => ({ status: i.progress.status, end_date: i.challenge.end_date }))
  );

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader title="Retos" subtitle="Pequeños desafíos en pareja para gastar menos sin darse cuenta." />
      <ChallengeManager
        householdId={householdId}
        userId={user.id}
        today={today}
        items={items}
        categories={(categories ?? []) as Category[]}
        streak={streak}
        won={won}
      />
    </AppShell>
  );
}
