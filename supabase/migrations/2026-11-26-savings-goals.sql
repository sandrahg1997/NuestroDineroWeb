-- OurMoney · Objetivos de ahorro
-- Ejecutar completo en Supabase > SQL Editor. Es idempotente.
--
-- * savings_goals: una meta compartida del hogar ("Viaje de verano", 1.500 €).
-- * savings_contributions: lo que se va apartando para esa meta. Una cantidad
--   negativa es una retirada. Son apuntes aparte: NO se suman a los gastos ni a los
--   ingresos de Movimientos.

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  icon text not null default '🎯',
  target_amount numeric(12,2) not null check(target_amount>0),
  target_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists savings_goals_household on public.savings_goals(household_id, created_at);

create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  amount numeric(12,2) not null check(amount<>0),
  date date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists savings_contributions_goal on public.savings_contributions(goal_id, date desc);
create index if not exists savings_contributions_household on public.savings_contributions(household_id);

alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;

drop policy if exists "household goals" on public.savings_goals;
create policy "household goals" on public.savings_goals for all
  using(public.is_household_member(household_id))
  with check(public.is_household_member(household_id));

drop policy if exists "household contributions read" on public.savings_contributions;
create policy "household contributions read" on public.savings_contributions for select
  using(public.is_household_member(household_id));
drop policy if exists "household contributions delete" on public.savings_contributions;
create policy "household contributions delete" on public.savings_contributions for delete
  using(public.is_household_member(household_id));
-- Quien aporta queda como autor, y la meta tiene que ser del mismo hogar.
drop policy if exists "household contributions insert" on public.savings_contributions;
create policy "household contributions insert" on public.savings_contributions for insert
  with check(
    public.is_household_member(household_id)
    and user_id = auth.uid()
    and exists(select 1 from public.savings_goals g where g.id = goal_id and g.household_id = savings_contributions.household_id)
  );

-- Tiempo real (solo si ya existe la función de 2026-10-30-realtime.sql).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'broadcast_household_change'
  ) then
    drop trigger if exists broadcast_change on public.savings_goals;
    create trigger broadcast_change after insert or update or delete on public.savings_goals
      for each row execute function public.broadcast_household_change();
    drop trigger if exists broadcast_change on public.savings_contributions;
    create trigger broadcast_change after insert or update or delete on public.savings_contributions
      for each row execute function public.broadcast_household_change();
  end if;
end $$;
