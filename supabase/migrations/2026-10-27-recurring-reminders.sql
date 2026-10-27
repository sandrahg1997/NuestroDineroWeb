-- OurMoney · Aviso de cobros recurrentes ("Mañana se cobra la hipoteca")
-- Ejecutar completo en Supabase > SQL Editor. Es idempotente.

alter table public.user_preferences
  add column if not exists notify_recurring_reminder boolean not null default true;

-- Se sustituye la versión de 2 parámetros. El tercero tiene valor por defecto,
-- así que la app desplegada antes de esta migración sigue funcionando.
drop function if exists public.set_notification_prefs(boolean, boolean);
create or replace function public.set_notification_prefs(
  p_partner_activity boolean,
  p_weekly_report boolean,
  p_recurring_reminder boolean default true
)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 insert into user_preferences(user_id,notify_partner_activity,notify_weekly_report,notify_recurring_reminder)
   values(auth.uid(),p_partner_activity,p_weekly_report,p_recurring_reminder)
   on conflict(user_id) do update
     set notify_partner_activity=excluded.notify_partner_activity,
         notify_weekly_report=excluded.notify_weekly_report,
         notify_recurring_reminder=excluded.notify_recurring_reminder;
end $$;
grant execute on function public.set_notification_prefs(boolean, boolean, boolean) to authenticated;
