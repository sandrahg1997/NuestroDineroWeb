import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/types";

export type HouseholdOption = {
  household_id: string;
  name: string;
  member_count: number;
  is_active: boolean;
  partner_email: string | null;
};

export async function getSessionContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      householdId: null,
      households: [] as HouseholdOption[],
      activePeriod: null as Period | null,
      hideAmounts: false,
    };
  }

  const [{ data: householdsData }, { data: prefs }] = await Promise.all([
    supabase.rpc("get_my_households"),
    supabase.from("user_preferences").select("hide_amounts").eq("user_id", user.id).maybeSingle(),
  ]);
  const households = (householdsData ?? []) as HouseholdOption[];
  const active = households.find((h) => h.is_active) ?? households[0] ?? null;
  const householdId = active?.household_id ?? null;
  const hideAmounts = prefs?.hide_amounts ?? false;

  let activePeriod: Period | null = null;
  if (householdId) {
    // Materializa los recurrentes vencidos al abrir la app, para que se vean sin
    // esperar al cron diario. Es idempotente y barato cuando no hay nada pendiente.
    try {
      await supabase.rpc("process_due_recurring", { p_household_id: householdId });
    } catch {
      // no bloquear el render si el RPC falla
    }

    const { data: householdRow } = await supabase
      .from("households")
      .select("active_period:periods!households_active_period_id_fkey(id,household_id,name,start_date,end_date,created_at)")
      .eq("id", householdId)
      .maybeSingle();
    activePeriod = ((householdRow?.active_period as unknown as Period | null) ?? null);
  }

  return { supabase, user, householdId, households, activePeriod, hideAmounts };
}
