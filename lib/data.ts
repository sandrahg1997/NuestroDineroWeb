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
    };
  }

  const { data: householdsData } = await supabase.rpc("get_my_households");
  const households = (householdsData ?? []) as HouseholdOption[];
  const active = households.find((h) => h.is_active) ?? households[0] ?? null;
  const householdId = active?.household_id ?? null;

  let activePeriod: Period | null = null;
  if (householdId) {
    const { data: householdRow } = await supabase
      .from("households")
      .select("active_period:periods!households_active_period_id_fkey(id,household_id,name,start_date,end_date,created_at)")
      .eq("id", householdId)
      .maybeSingle();
    activePeriod = ((householdRow?.active_period as unknown as Period | null) ?? null);
  }

  return { supabase, user, householdId, households, activePeriod };
}
