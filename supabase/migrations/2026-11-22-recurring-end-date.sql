-- OurMoney · Fecha de finalización opcional en los recurrentes
-- Ejecutar completo en Supabase > SQL Editor. Es idempotente.
--
-- * `end_date` null = sin fin (como hasta ahora).
-- * Los procesados no generan movimientos posteriores a `end_date`.
-- * Cuando un recurrente supera su fecha de fin se pausa solo (is_active=false).

alter table public.recurring_transactions
  add column if not exists end_date date;

create or replace function public.process_due_recurring(p_household_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare r recurring_transactions%rowtype; generated integer:=0; d date; guard integer;
begin
 if not is_household_member(p_household_id) then raise exception 'Sin permiso'; end if;

 update households
   set recurring_checked_at = now()
   where id = p_household_id
     and (recurring_checked_at is null or recurring_checked_at < now() - interval '15 minutes');
 if not found then return 0; end if;

 for r in select * from recurring_transactions where household_id=p_household_id and is_active and next_date<=current_date for update loop
   d:=r.next_date; guard:=0;
   while d<=current_date and (r.end_date is null or d<=r.end_date) and guard<600 loop
     insert into transactions(household_id,user_id,concept,amount,date,category_id,type,note,recurring_id)
     values(r.household_id,auth.uid(),r.concept,r.amount,d,r.category_id,r.type,r.note,r.id)
     on conflict do nothing;
     generated:=generated+1;
     d:=case r.frequency when 'weekly' then d+7 when 'monthly' then (d+interval '1 month')::date else (d+interval '1 year')::date end;
     guard:=guard+1;
   end loop;
   update recurring_transactions
     set next_date=d,
         is_active=(r.end_date is null or d<=r.end_date)
     where id=r.id;
 end loop;
 return generated;
end $$;
grant execute on function public.process_due_recurring(uuid) to authenticated;

create or replace function public.process_all_due_recurring() returns integer language plpgsql security definer set search_path=public as $$
declare r record; generated integer:=0; d date; guard integer;
begin
 for r in
   select rt.*, h.owner_id as household_owner_id
   from recurring_transactions rt
   join households h on h.id=rt.household_id
   where rt.is_active and rt.next_date<=current_date
   for update of rt
 loop
   d:=r.next_date; guard:=0;
   while d<=current_date and (r.end_date is null or d<=r.end_date) and guard<600 loop
     insert into transactions(household_id,user_id,concept,amount,date,category_id,type,note,recurring_id)
     values(r.household_id,r.household_owner_id,r.concept,r.amount,d,r.category_id,r.type,r.note,r.id)
     on conflict do nothing;
     generated:=generated+1;
     d:=case r.frequency when 'weekly' then d+7 when 'monthly' then (d+interval '1 month')::date else (d+interval '1 year')::date end;
     guard:=guard+1;
   end loop;
   update recurring_transactions
     set next_date=d,
         is_active=(r.end_date is null or d<=r.end_date)
     where id=r.id;
 end loop;
 return generated;
end $$;
revoke all on function public.process_all_due_recurring() from public, anon, authenticated;
grant execute on function public.process_all_due_recurring() to service_role;
