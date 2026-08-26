import AppShell from "@/components/AppShell";
import HistoricoChartsLoader from "@/components/HistoricoChartsLoader";
import PageHeader from "@/components/PageHeader";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";

export default async function HistoricoPage() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const [{ data: transactions }, { data: categories }] = await Promise.all([
    supabase.from("transactions").select("date,amount,type,category_id").eq("household_id", householdId),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
  ]);

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader title="Histórico" subtitle="Evolución de tus gastos e ingresos a lo largo del tiempo." />
      <HistoricoChartsLoader transactions={(transactions ?? []) as any} categories={(categories ?? []) as any} hideAmounts={hideAmounts} />
    </AppShell>
  );
}
