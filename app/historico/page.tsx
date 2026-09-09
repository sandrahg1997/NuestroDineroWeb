import AppShell from "@/components/AppShell";
import HistoricoChartsLoader from "@/components/HistoricoChartsLoader";
import PageHeader from "@/components/PageHeader";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";

export default async function HistoricoPage() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  // El histórico se agrupa por periodos (rangos definidos por el usuario, que
  // pueden solaparse o no ser meses naturales), así que necesitamos las fechas
  // de cada movimiento para asignarlo a su periodo.
  const [{ data: periods }, { data: transactions }, { data: categories }] = await Promise.all([
    supabase
      .from("periods")
      .select("id,name,start_date,end_date")
      .eq("household_id", householdId)
      .order("start_date", { ascending: true }),
    supabase.from("transactions").select("date,amount,type,category_id").eq("household_id", householdId),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
  ]);

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader title="Histórico" subtitle="Evolución de tus gastos e ingresos periodo a periodo." />
      <HistoricoChartsLoader
        transactions={(transactions ?? []) as any}
        categories={(categories ?? []) as any}
        periods={(periods ?? []) as any}
        hideAmounts={hideAmounts}
      />
    </AppShell>
  );
}
