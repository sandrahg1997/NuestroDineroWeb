import { createClient } from "@/lib/supabase/server";
import type { Period } from "@/lib/types";

export type HouseholdOption = {
  household_id: string;
  name: string;
  member_count: number;
  is_active: boolean;
  partner_email: string | null;
};

const EMPTY = {
  householdId: null,
  households: [] as HouseholdOption[],
  activePeriod: null as Period | null,
  hideAmounts: false,
};

export async function getSessionContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ...EMPTY };

  let households: HouseholdOption[] = [];
  let hideAmounts = false;
  let activePeriod: Period | null = null;

  // Una sola llamada: hogares + preferencias + periodo activo.
  const { data: boot, error } = await supabase.rpc("get_session_bootstrap");

  if (!error && boot) {
    households = (boot.households ?? []) as HouseholdOption[];
    hideAmounts = Boolean(boot.hide_amounts);
    activePeriod = (boot.active_period as Period | null) ?? null;
  } else {
    // Fallback si la BD aún no tiene la función get_session_bootstrap.
    const [{ data: householdsData }, { data: prefs }] = await Promise.all([
      supabase.rpc("get_my_households"),
      supabase.from("user_preferences").select("hide_amounts").eq("user_id", user.id).maybeSingle(),
    ]);
    households = (householdsData ?? []) as HouseholdOption[];
    hideAmounts = prefs?.hide_amounts ?? false;
    const activeId = households.find((h) => h.is_active)?.household_id ?? households[0]?.household_id ?? null;
    if (activeId) {
      const { data: householdRow } = await supabase
        .from("households")
        .select(
          "active_period:periods!households_active_period_id_fkey(id,household_id,name,start_date,end_date,created_at)"
        )
        .eq("id", activeId)
        .maybeSingle();
      activePeriod = (householdRow?.active_period as unknown as Period | null) ?? null;
    }
  }

  const active = households.find((h) => h.is_active) ?? households[0] ?? null;
  const householdId = active?.household_id ?? null;

  if (householdId) {
    // Materializa los recurrentes vencidos al abrir la app. La función SQL se
    // autolimita (una vez cada 15 min por hogar), así que aquí es un no-op barato
    // la mayoría de las veces.
    try {
      await supabase.rpc("process_due_recurring", { p_household_id: householdId });
    } catch {
      // no bloquear el render si el RPC falla
    }
  }

  return { supabase, user, householdId, households, activePeriod, hideAmounts };
}
