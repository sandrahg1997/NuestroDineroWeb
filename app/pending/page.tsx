import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import PendingManager from "@/components/PendingManager";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";
export default async function Page() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId) redirect("/settings");
  const [{ data: pending }, { data: categories }, { data: rules }] = await Promise.all([
    supabase
      .from("pending_transactions")
      .select("id,user_id,merchant,amount,type,date,card,possible_duplicate,created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").eq("household_id", householdId).order("name"),
    supabase.from("merchant_category_rules").select("merchant_pattern,category_id").eq("household_id", householdId),
  ]);
  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader
        title="Pendientes de confirmar"
        subtitle="Pagos con Apple Pay que llegan solos. Revisa y confirma con un toque."
      />
      <PendingManager
        householdId={householdId}
        initial={pending ?? []}
        categories={categories ?? []}
        rules={rules ?? []}
      />
    </AppShell>
  );
}
