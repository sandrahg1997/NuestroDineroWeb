import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import TransactionManager from "@/components/TransactionManager";
import { getSessionContext } from "@/lib/data";
import { fetchAll } from "@/lib/fetch-all";
import { redirect } from "next/navigation";
export default async function TransactionsPage() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");
  const [{ data: transactions }, { data: categories }, { data: rules }, { data: periods }] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("transactions")
        .select("*,category:categories(*)")
        .eq("household_id", householdId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
    supabase.from("merchant_category_rules").select("merchant_pattern,category_id").eq("household_id", householdId),
    supabase
      .from("periods")
      .select("id,name,start_date,end_date")
      .eq("household_id", householdId)
      .order("start_date", { ascending: false }),
  ]);
  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader title="Movimientos" subtitle="Busca, filtra, edita y elimina gastos e ingresos." />
      <TransactionManager
        householdId={householdId}
        userId={user.id}
        initial={(transactions ?? []) as any}
        initialCategories={(categories ?? []) as any}
        rules={(rules ?? []) as any}
        periods={periods ?? []}
      />
    </AppShell>
  );
}
