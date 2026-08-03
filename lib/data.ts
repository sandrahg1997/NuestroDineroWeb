import { createClient } from "@/lib/supabase/server";

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
      dashboardRangeFrom: null,
      dashboardRangeTo: null,
    };
  }

  const { data: householdsData } = await supabase.rpc("get_my_households");
  const households = (householdsData ?? []) as HouseholdOption[];
  const active = households.find((h) => h.is_active) ?? households[0] ?? null;
  const householdId = active?.household_id ?? null;

  let dashboardRangeFrom: string | null = null;
  let dashboardRangeTo: string | null = null;
  if (householdId) {
    const { data: membership } = await supabase
      .from("household_members")
      .select("dashboard_range_from,dashboard_range_to")
      .eq("user_id", user.id)
      .eq("household_id", householdId)
      .maybeSingle();
    dashboardRangeFrom = membership?.dashboard_range_from ?? null;
    dashboardRangeTo = membership?.dashboard_range_to ?? null;
  }

  return { supabase, user, householdId, households, dashboardRangeFrom, dashboardRangeTo };
}
