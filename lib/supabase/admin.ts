import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Solo para usarse en código de servidor (route handlers / server actions).
// La service_role key nunca debe llegar al navegador ni llevar el prefijo NEXT_PUBLIC_.
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
