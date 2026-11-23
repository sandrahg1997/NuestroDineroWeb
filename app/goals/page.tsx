import AppShell from "@/components/AppShell";
import GoalManager from "@/components/GoalManager";
import PageHeader from "@/components/PageHeader";
import { getSessionContext } from "@/lib/data";
import type { Contribution, Goal } from "@/lib/goals";
import { dateKey } from "@/lib/utils";
import { redirect } from "next/navigation";

export default async function Page() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");
  // Si la migración de objetivos aún no está aplicada, las tablas no existen y viene vacío.
  const [{ data: goals, error }, { data: contributions }] = await Promise.all([
    supabase.from("savings_goals").select("*").eq("household_id", householdId).order("created_at"),
    supabase
      .from("savings_contributions")
      .select("*")
      .eq("household_id", householdId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader
        title="Objetivos de ahorro"
        subtitle="Metas que vais cumpliendo juntos: un viaje, un colchón, una reforma…"
      />
      <GoalManager
        householdId={householdId}
        userId={user.id}
        today={dateKey()}
        unavailable={Boolean(error)}
        initialGoals={(goals ?? []) as Goal[]}
        initialContributions={(contributions ?? []) as Contribution[]}
      />
    </AppShell>
  );
}
