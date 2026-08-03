import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import BudgetManager from "@/components/BudgetManager";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";

export default async function Page() {
  const { supabase, user, householdId, households, activePeriod } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");
  if (!activePeriod) redirect("/periods");

  const [{ data: b }, { data: c }, { data: t }] = await Promise.all([
    supabase.from("budgets").select("*,category:categories(*)").eq("household_id", householdId).eq("period_id", activePeriod.id),
    supabase.from("categories").select("*").eq("household_id", householdId),
    supabase.from("transactions").select("category_id,amount").eq("household_id", householdId).eq("type", "expense").gte("date", activePeriod.start_date).lte("date", activePeriod.end_date),
  ]);

  const spending: Record<string, number> = {};
  for (const x of t ?? []) if (x.category_id) spending[x.category_id] = (spending[x.category_id] ?? 0) + Number(x.amount);

  return (
    <AppShell households={households}>
      <PageHeader title="Presupuestos" subtitle={`Control del periodo, general y por categoría · ${activePeriod.name}`} />
      <BudgetManager householdId={householdId} periodId={activePeriod.id} periodLabel={activePeriod.name} initial={(b ?? []) as any} categories={(c ?? []) as any} spending={spending} />
    </AppShell>
  );
}
