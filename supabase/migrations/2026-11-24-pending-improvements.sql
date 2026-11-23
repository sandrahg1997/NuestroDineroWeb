-- OurMoney · Mejoras de Pendientes (Apple Pay)
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de 2026-11-23-pending-ingest.sql.
-- Es idempotente.
--
-- * merchant_category_rules.auto_confirm: si es true, los pagos de ese comercio se
--   guardan directamente como movimiento, sin pasar por Pendientes.
-- * ingest_failures: pagos que llegaron a /api/ingest pero no se pudieron leer
--   (importe ilegible, cuerpo mal formado). Solo los inserta el servidor.

alter table public.merchant_category_rules
  add column if not exists auto_confirm boolean not null default false;

create table if not exists public.ingest_failures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null default '',
  raw text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ingest_failures_household on public.ingest_failures(household_id, created_at desc);

alter table public.ingest_failures enable row level security;

-- Sin política de insert: solo el servidor (service_role) registra fallos.
drop policy if exists "household failures read" on public.ingest_failures;
create policy "household failures read" on public.ingest_failures for select
  using(public.is_household_member(household_id));
drop policy if exists "household failures delete" on public.ingest_failures;
create policy "household failures delete" on public.ingest_failures for delete
  using(public.is_household_member(household_id));

-- Tiempo real (solo si ya existe la función de 2026-10-30-realtime.sql).
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'broadcast_household_change'
  ) then
    drop trigger if exists broadcast_change on public.ingest_failures;
    create trigger broadcast_change after insert or update or delete on public.ingest_failures
      for each row execute function public.broadcast_household_change();
  end if;
end $$;
