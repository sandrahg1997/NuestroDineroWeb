import AppShell from "@/components/AppShell";
import HistoricoChartsLoader from "@/components/HistoricoChartsLoader";
import PageHeader from "@/components/PageHeader";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";

type Row = { date: string; amount: number; type: "expense" | "income"; category_id: string | null };

export default async function HistoricoPage() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");

  const [{ data: monthly, error: monthlyError }, { data: categories }] = await Promise.all([
    // Totales por mes/categoría/tipo agregados en Postgres (docenas de filas en
    // vez de todos los movimientos históricos).
    supabase.rpc("monthly_category_totals", { p_household_id: householdId }),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
  ]);

  let rows: Row[];
  if (!monthlyError && monthly) {
    // Cada fila agregada equivale a un "movimiento" con fecha el día 1 del mes:
    // HistoricoCharts solo agrupa por mes y suma importes.
    rows = (monthly as { month: string; category_id: string | null; type: "expense" | "income"; total: number | string }[])
      .map((r) => ({ date: `${r.month}-01`, amount: Number(r.total), type: r.type, category_id: r.category_id }));
  } else {
    // Fallback si la BD aún no tiene monthly_category_totals.
    const { data } = await supabase
      .from("transactions")
      .select("date,amount,type,category_id")
      .eq("household_id", householdId);
    rows = (data ?? []) as Row[];
  }

  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader title="Histórico" subtitle="Evolución de tus gastos e ingresos a lo largo del tiempo." />
      <HistoricoChartsLoader transactions={rows} categories={(categories ?? []) as any} hideAmounts={hideAmounts} />
    </AppShell>
  );
}
