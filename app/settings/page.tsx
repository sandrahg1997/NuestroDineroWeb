import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import SettingsManager from "@/components/SettingsManager";
import LogoutButton from "@/components/LogoutButton";
import { getSessionContext } from "@/lib/data";
import { redirect } from "next/navigation";
export default async function Page() {
  const { supabase, user, householdId, households, hideAmounts } = await getSessionContext();
  if (!user) redirect("/login");
  if (!householdId)
    return (
      <AppShell>
        <PageHeader title="Preparando tu espacio…" />
        <p>Vuelve a iniciar sesión si esta pantalla no se actualiza.</p>
      </AppShell>
    );
  const [{ data: h }, { data: prefs }] = await Promise.all([
    supabase.from("households").select("name,invite_code").eq("id", householdId).single(),
    // Si la migración de notificaciones aún no está aplicada, esto falla y se usan los valores por defecto.
    supabase
      .from("user_preferences")
      .select("notify_partner_activity,notify_weekly_report")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  return (
    <AppShell households={households} hideAmounts={hideAmounts}>
      <PageHeader
        title="Ajustes y sincronización"
        subtitle="Comparte la aplicación entre dos iPhone, Android u ordenadores."
        actions={<LogoutButton />}
      />
      <SettingsManager
        householdId={householdId}
        householdName={h?.name ?? "Nuestro hogar"}
        inviteCode={h?.invite_code ?? ""}
        email={user.email ?? ""}
        displayName={(user.user_metadata?.display_name as string) ?? ""}
        userId={user.id}
        notifyPartnerActivity={prefs?.notify_partner_activity ?? true}
        notifyWeeklyReport={prefs?.notify_weekly_report ?? true}
      />
    </AppShell>
  );
}
