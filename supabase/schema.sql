-- Nuestro Dinero Web · Ejecutar completo en Supabase > SQL Editor
create extension if not exists pgcrypto;

create type public.transaction_type as enum ('expense','income');
create type public.recurrence_frequency as enum ('weekly','monthly','yearly');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nuestro hogar',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','member')),
  dashboard_range_from date, dashboard_range_to date,
  created_at timestamptz not null default now(),
  primary key(household_id,user_id),
  unique(user_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  name text not null, icon text not null default '📦', type transaction_type not null, is_default boolean not null default false,
  created_at timestamptz not null default now(), unique(household_id,type,name)
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id), concept text not null, amount numeric(12,2) not null check(amount>0),
  date date not null default current_date, category_id uuid references public.categories(id) on delete set null,
  type transaction_type not null, note text not null default '', merchant text not null default '', receipt_text text not null default '',
  recurring_id uuid, created_at timestamptz not null default now()
);
create table public.recurring_transactions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  concept text not null, amount numeric(12,2) not null check(amount>0), category_id uuid references public.categories(id) on delete set null,
  type transaction_type not null, note text not null default '', frequency recurrence_frequency not null default 'monthly',
  next_date date not null default current_date, is_active boolean not null default true, created_at timestamptz not null default now()
);
alter table public.transactions add constraint transactions_recurring_fk foreign key(recurring_id) references public.recurring_transactions(id) on delete set null;
create unique index transactions_no_duplicate_recurrence on public.transactions(recurring_id,date) where recurring_id is not null;
create table public.budgets (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade, amount numeric(12,2) not null check(amount>0), month date not null,
  created_at timestamptz not null default now()
);
create unique index budgets_unique_general on public.budgets(household_id,month) where category_id is null;
create unique index budgets_unique_category on public.budgets(household_id,category_id,month) where category_id is not null;
create table public.merchant_category_rules (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  merchant_pattern text not null, category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(), unique(household_id,merchant_pattern)
);

create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.household_members where household_id=p_household and user_id=auth.uid());
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.merchant_category_rules enable row level security;

create policy "members read households" on public.households for select using(public.is_household_member(id));
create policy "members update households" on public.households for update using(public.is_household_member(id));
create policy "members read memberships" on public.household_members for select using(public.is_household_member(household_id));
create policy "members update own membership" on public.household_members for update using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy "household categories" on public.categories for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
create policy "household transactions" on public.transactions for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id) and user_id=auth.uid());
create policy "household recurring" on public.recurring_transactions for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
create policy "household budgets" on public.budgets for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
create policy "household merchant rules" on public.merchant_category_rules for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));

create or replace function public.seed_categories(p_household uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 insert into categories(household_id,name,icon,type,is_default) values
 (p_household,'Supermercado','🛒','expense',true),(p_household,'Restaurantes','🍽️','expense',true),(p_household,'Vivienda','🏠','expense',true),
 (p_household,'Transporte','🚗','expense',true),(p_household,'Ocio','🎮','expense',true),(p_household,'Salud','🩺','expense',true),
 (p_household,'Ropa','👕','expense',true),(p_household,'Viajes','✈️','expense',true),(p_household,'Suscripciones','🔁','expense',true),
 (p_household,'Otros','📦','expense',true),(p_household,'Nómina','💼','income',true),(p_household,'Alquiler','🏠','income',true),
 (p_household,'Devolución','↩️','income',true),(p_household,'Extraordinario','✨','income',true),(p_household,'Otros','💰','income',true)
 on conflict do nothing;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare h uuid;
begin
 insert into households(name,owner_id) values(coalesce(new.raw_user_meta_data->>'display_name','Nuestro hogar'),new.id) returning id into h;
 insert into household_members(household_id,user_id,role) values(h,new.id,'owner');
 perform seed_categories(h);
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.join_household(p_invite_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid; old_h uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 select id into target from households where invite_code=upper(trim(p_invite_code));
 if target is null then raise exception 'Código no válido'; end if;
 select household_id into old_h from household_members where user_id=auth.uid();
 delete from household_members where user_id=auth.uid();
 insert into household_members(household_id,user_id,role) values(target,auth.uid(),'member');
 -- El espacio personal vacío queda eliminado; si tenía datos se conserva para evitar pérdidas.
 if old_h is not null and not exists(select 1 from transactions where household_id=old_h) and not exists(select 1 from household_members where household_id=old_h) then delete from households where id=old_h; end if;
 return target;
end $$;
grant execute on function public.join_household(text) to authenticated;

create or replace function public.process_due_recurring(p_household_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare r recurring_transactions%rowtype; generated integer:=0; d date;
begin
 if not is_household_member(p_household_id) then raise exception 'Sin permiso'; end if;
 for r in select * from recurring_transactions where household_id=p_household_id and is_active and next_date<=current_date for update loop
   d:=r.next_date;
   while d<=current_date loop
     insert into transactions(household_id,user_id,concept,amount,date,category_id,type,note,recurring_id)
     values(r.household_id,auth.uid(),r.concept,r.amount,d,r.category_id,r.type,r.note,r.id)
     on conflict do nothing;
     generated:=generated+1;
     d:=case r.frequency when 'weekly' then d+7 when 'monthly' then (d+interval '1 month')::date else (d+interval '1 year')::date end;
   end loop;
   update recurring_transactions set next_date=d where id=r.id;
 end loop;
 return generated;
end $$;
grant execute on function public.process_due_recurring(uuid) to authenticated;

create index transactions_household_date on transactions(household_id,date desc);
create index categories_household on categories(household_id,type);
create index recurring_due on recurring_transactions(household_id,next_date) where is_active;
