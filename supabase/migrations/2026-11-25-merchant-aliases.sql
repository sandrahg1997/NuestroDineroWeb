-- OurMoney · Nombres limpios de comercio (Apple Pay)
-- Ejecutar completo en Supabase > SQL Editor, DESPUÉS de las migraciones anteriores
-- de Pendientes. Es idempotente.
--
-- * merchant_aliases: cómo habéis renombrado un comercio ("MERCADONA ARANDA 0123" →
--   "Mercadona"). `key` es el nombre sin mayúsculas, acentos ni números.
-- * pending_transactions.raw_merchant: el nombre original que mandó Apple Pay, para
--   poder recordar el cambio de nombre al confirmar.

alter table public.pending_transactions
  add column if not exists raw_merchant text not null default '';

create table if not exists public.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(household_id, key)
);

alter table public.merchant_aliases enable row level security;
drop policy if exists "household merchant aliases" on public.merchant_aliases;
create policy "household merchant aliases" on public.merchant_aliases for all
  using(public.is_household_member(household_id))
  with check(public.is_household_member(household_id));
