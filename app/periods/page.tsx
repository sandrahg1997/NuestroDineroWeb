import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import PeriodManager from "@/components/PeriodManager";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";

export default async function Page() {
  const { supabase, user, householdId, households, activePeriod } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const [{ data: periods }, { data: tx }] = await Promise.all([
    supabase.from("periods").select("*").eq("household_id", householdId).order("start_date", { ascending: false }),
    supabase.from("transactions").select("type,amount,date").eq("household_id", householdId),
  ]);

  const rows = periods ?? [];
  const transactions = tx ?? [];
  const withSummary = rows.map((p) => {
    const inRange = transactions.filter((t) => t.date >= p.start_date && t.date <= p.end_date);
    const expense = inRange.filter((t) => t.type === "expense").reduce((total, t) => total + Number(t.amount), 0);
    const income = inRange.filter((t) => t.type === "income").reduce((total, t) => total + Number(t.amount), 0);
    return { ...p, expense, income };
  });

  return (
    <AppShell households={households}>
      <PageHeader title="Periodos" subtitle="Crea, edita y consulta el histórico de periodos de vuestro espacio." />
      <PeriodManager householdId={householdId} initial={withSummary as any} activePeriodId={activePeriod?.id ?? null} />
    </AppShell>
  );
}
