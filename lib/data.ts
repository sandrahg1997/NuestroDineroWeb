import { createClient } from "@/lib/supabase/server";
export async function getSessionContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, householdId: null };
  const { data: membership } = await supabase.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle();
  return { supabase, user, householdId: membership?.household_id ?? null };
}
