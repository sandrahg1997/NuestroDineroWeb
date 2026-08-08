-- Nuestro Dinero Web · Ejecutar completo en Supabase > SQL Editor
create extension if not exists pgcrypto;

create type public.transaction_type as enum ('expense','income');
create type public.recurrence_frequency as enum ('weekly','monthly','yearly');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nuestro hogar',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6),'hex'),1,8)),
  owner_id uuid not null references auth.users(id) on delete cascade,
  active_period_id uuid,
  created_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key(household_id,user_id)
);
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_household_id uuid references public.households(id) on delete set null,
  hide_amounts boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check(end_date>=start_date)
);
create index periods_household on public.periods(household_id,start_date desc);
alter table public.households add constraint households_active_period_id_fkey foreign key(active_period_id) references public.periods(id) on delete set null;
create table public.categories (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  name text not null, icon text not null default '📦', type transaction_type not null, is_default boolean not null default false,
  created_at timestamptz not null default now(), unique(household_id,type,name)
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, concept text not null, amount numeric(12,2) not null check(amount>0),
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
  category_id uuid references public.categories(id) on delete cascade, amount numeric(12,2) not null check(amount>0),
  period_id uuid not null references public.periods(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index budgets_unique_general on public.budgets(household_id,period_id) where category_id is null;
create unique index budgets_unique_category on public.budgets(household_id,category_id,period_id) where category_id is not null;
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
alter table public.user_preferences enable row level security;
alter table public.periods enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.merchant_category_rules enable row level security;

create policy "members read households" on public.households for select using(public.is_household_member(id));
create policy "members update households" on public.households for update using(public.is_household_member(id));
create policy "members read memberships" on public.household_members for select using(public.is_household_member(household_id));
create policy "user reads own preferences" on public.user_preferences for select using(user_id=auth.uid());
create policy "household periods" on public.periods for all using(public.is_household_member(household_id)) with check(public.is_household_member(household_id));
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

create or replace function public.create_initial_period(p_household uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p uuid;
begin
 insert into periods(household_id,name,start_date,end_date)
 values(p_household, initcap(to_char(date_trunc('month',current_date),'TMMonth YYYY')), date_trunc('month',current_date)::date, (date_trunc('month',current_date)+interval '1 month'-interval '1 day')::date)
 returning id into p;
 update households set active_period_id=p where id=p_household;
 return p;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare h uuid;
begin
 insert into households(name,owner_id) values(coalesce(new.raw_user_meta_data->>'display_name','Nuestro hogar'),new.id) returning id into h;
 insert into household_members(household_id,user_id,role) values(h,new.id,'owner');
 perform seed_categories(h);
 perform create_initial_period(h);
 insert into user_preferences(user_id,active_household_id) values(new.id,h);
 return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.join_household(p_invite_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 select id into target from households where invite_code=upper(trim(p_invite_code));
 if target is null then raise exception 'Código no válido'; end if;
 insert into household_members(household_id,user_id,role) values(target,auth.uid(),'member') on conflict(household_id,user_id) do nothing;
 insert into user_preferences(user_id,active_household_id) values(auth.uid(),target)
   on conflict(user_id) do update set active_household_id=excluded.active_household_id;
 return target;
end $$;
grant execute on function public.join_household(text) to authenticated;

create or replace function public.create_personal_household(p_name text default 'Mi espacio personal') returns uuid language plpgsql security definer set search_path=public as $$
declare h uuid;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 insert into households(name,owner_id) values(p_name,auth.uid()) returning id into h;
 insert into household_members(household_id,user_id,role) values(h,auth.uid(),'owner');
 perform seed_categories(h);
 perform create_initial_period(h);
 insert into user_preferences(user_id,active_household_id) values(auth.uid(),h)
   on conflict(user_id) do update set active_household_id=excluded.active_household_id;
 return h;
end $$;
grant execute on function public.create_personal_household(text) to authenticated;

create or replace function public.set_active_household(p_household_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from household_members where household_id=p_household_id and user_id=auth.uid()) then
   raise exception 'No perteneces a ese espacio';
 end if;
 insert into user_preferences(user_id,active_household_id) values(auth.uid(),p_household_id)
   on conflict(user_id) do update set active_household_id=excluded.active_household_id;
end $$;
grant execute on function public.set_active_household(uuid) to authenticated;

create or replace function public.set_hide_amounts(p_hidden boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 insert into user_preferences(user_id,hide_amounts) values(auth.uid(),p_hidden)
   on conflict(user_id) do update set hide_amounts=excluded.hide_amounts;
end $$;
grant execute on function public.set_hide_amounts(boolean) to authenticated;

create or replace function public.get_my_households()
returns table(household_id uuid, name text, member_count bigint, is_active boolean, partner_email text)
language plpgsql stable security definer set search_path=public as $$
declare active_id uuid;
begin
 select active_household_id into active_id from user_preferences where user_id=auth.uid();
 return query
  select h.id, h.name,
    (select count(*) from household_members m where m.household_id=h.id),
    h.id = coalesce(active_id,(select hm0.household_id from household_members hm0 where hm0.user_id=auth.uid() order by hm0.created_at limit 1)),
    (select u.email::text from household_members m2 join auth.users u on u.id=m2.user_id where m2.household_id=h.id and m2.user_id<>auth.uid() limit 1)
  from households h
  join household_members hm on hm.household_id=h.id and hm.user_id=auth.uid()
  order by hm.created_at;
end $$;
grant execute on function public.get_my_households() to authenticated;

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
