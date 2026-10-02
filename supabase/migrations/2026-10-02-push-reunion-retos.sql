-- OurMoney · Notificaciones push, reunión del mes y retos en pareja
-- Ejecutar completo en Supabase > SQL Editor. Es idempotente.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Notificaciones push
-- Una fila por dispositivo suscrito. Cada usuario solo ve y gestiona las suyas;
-- el servidor envía con la service_role key, que se salta RLS.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "user manages own push subscriptions" on public.push_subscriptions;
create policy "user manages own push subscriptions" on public.push_subscriptions
  for all using(user_id=auth.uid()) with check(user_id=auth.uid());

alter table public.user_preferences
  add column if not exists notify_partner_activity boolean not null default true,
  add column if not exists notify_weekly_report boolean not null default true;

-- user_preferences solo tiene política de lectura: se escribe vía RPC.
create or replace function public.set_notification_prefs(p_partner_activity boolean, p_weekly_report boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 insert into user_preferences(user_id,notify_partner_activity,notify_weekly_report)
   values(auth.uid(),p_partner_activity,p_weekly_report)
   on conflict(user_id) do update
     set notify_partner_activity=excluded.notify_partner_activity,
         notify_weekly_report=excluded.notify_weekly_report;
end $$;
grant execute on function public.set_notification_prefs(boolean, boolean) to authenticated;

-- Marca de "ya se avisó a la pareja de este movimiento": evita avisos repetidos
-- si el endpoint se llama dos veces para el mismo movimiento.
alter table public.transactions add column if not exists activity_notified_at timestamptz;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Reunión del mes: acuerdos que la pareja apunta al revisar un periodo
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.period_reviews (
  period_id uuid primary key references public.periods(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  agreements text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.period_reviews enable row level security;
drop policy if exists "household period reviews" on public.period_reviews;
create policy "household period reviews" on public.period_reviews
  for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Retos en pareja
-- kind = 'no_spend': superado si no hay ningún gasto que encaje en el rango.
-- kind = 'limit':    superado si lo gastado no pasa de limit_amount.
-- Qué gastos "encajan": los de category_id, o los que contienen alguna de las
-- keywords en concepto/comercio, o (si no hay ninguna de las dos) cualquier gasto
-- no recurrente.
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  icon text not null default '🎯',
  kind text not null default 'no_spend' check(kind in ('no_spend','limit')),
  category_id uuid references public.categories(id) on delete set null,
  keywords text[] not null default '{}',
  limit_amount numeric(12,2) check(limit_amount is null or limit_amount>0),
  start_date date not null,
  end_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check(end_date>=start_date),
  check(kind<>'limit' or limit_amount is not null)
);
create index if not exists challenges_household on public.challenges(household_id,end_date desc);
alter table public.challenges enable row level security;
drop policy if exists "household challenges" on public.challenges;
create policy "household challenges" on public.challenges
  for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
