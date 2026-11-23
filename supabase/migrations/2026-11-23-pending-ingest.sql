-- OurMoney · Gastos pendientes de confirmar (Apple Pay vía Atajos de iOS)
-- Ejecutar completo en Supabase > SQL Editor. Es idempotente.
--
-- * `ingest_tokens`: un token por persona y dispositivo. Solo se guarda su hash
--   (SHA-256); el token en claro se enseña una única vez al crearlo.
-- * `pending_transactions`: movimientos recibidos por /api/ingest que esperan
--   confirmación. Solo se insertan desde el servidor (service_role). Al
--   confirmar o descartar, la fila se borra.

create table if not exists public.ingest_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'iPhone',
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ingest_tokens_user on public.ingest_tokens(user_id);

create table if not exists public.pending_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  merchant text not null default '',
  amount numeric(12,2) not null check(amount>0),
  type transaction_type not null default 'expense',
  date date not null default current_date,
  card text not null default '',
  raw_amount text not null default '',
  possible_duplicate boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pending_household on public.pending_transactions(household_id, created_at desc);

alter table public.ingest_tokens enable row level security;
alter table public.pending_transactions enable row level security;

drop policy if exists "own ingest tokens" on public.ingest_tokens;
create policy "own ingest tokens" on public.ingest_tokens for all
  using(user_id=auth.uid())
  with check(user_id=auth.uid() and public.is_household_member(household_id));

-- Sin política de insert: solo el servidor (service_role) crea pendientes.
drop policy if exists "household pending read" on public.pending_transactions;
create policy "household pending read" on public.pending_transactions for select
  using(public.is_household_member(household_id));
drop policy if exists "household pending update" on public.pending_transactions;
create policy "household pending update" on public.pending_transactions for update
  using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
drop policy if exists "household pending delete" on public.pending_transactions;
create policy "household pending delete" on public.pending_transactions for delete
  using(public.is_household_member(household_id));

-- Confirma un pendiente: crea el movimiento (atribuido a quien pagó) y borra el
-- pendiente en la misma transacción, así que no puede confirmarse dos veces.
create or replace function public.confirm_pending_transaction(
  p_id uuid, p_concept text, p_merchant text, p_amount numeric, p_date date, p_category_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare pt pending_transactions%rowtype; new_id uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 select * into pt from pending_transactions where id=p_id for update;
 if not found then raise exception 'Este pendiente ya no existe'; end if;
 if not is_household_member(pt.household_id) then raise exception 'Sin permiso'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Importe no válido'; end if;
 if p_category_id is not null and not exists(
   select 1 from categories where id=p_category_id and household_id=pt.household_id and type=pt.type
 ) then raise exception 'Categoría no válida'; end if;
 insert into transactions(household_id,user_id,concept,merchant,amount,date,category_id,type,note)
 values(pt.household_id, coalesce(pt.user_id, auth.uid()),
   coalesce(nullif(trim(p_concept),''), nullif(trim(p_merchant),''), 'Compra'),
   coalesce(trim(p_merchant),''), p_amount, p_date, p_category_id, pt.type, 'Apple Pay')
 returning id into new_id;
 delete from pending_transactions where id=p_id;
 return new_id;
end $$;
grant execute on function public.confirm_pending_transaction(uuid,text,text,numeric,date,uuid) to authenticated;

-- Tiempo real: la bandeja se actualiza sola cuando llega un pendiente. Solo se
-- activa si ya está aplicada 2026-10-30-realtime.sql (la que crea la función);
-- si no, la bandeja funciona igual pero hay que recargar para ver lo nuevo.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'broadcast_household_change'
  ) then
    drop trigger if exists broadcast_change on public.pending_transactions;
    create trigger broadcast_change after insert or update or delete on public.pending_transactions
      for each row execute function public.broadcast_household_change();
  end if;
end $$;
