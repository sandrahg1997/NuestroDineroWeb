-- OurMoney · Mejoras de rendimiento · Ejecutar completo en Supabase > SQL Editor
-- Es idempotente y la app funciona igual (sin la mejora) si aún no se ha aplicado.

-- ───────────────────────────────────────────────────────────────────────────
-- 1) process_due_recurring: autolimitado
-- La app lo llama en CADA carga de página. Antes: un escaneo de recurrentes por
-- navegación. Ahora un UPDATE atómico "reclama el turno" y solo deja pasar una
-- comprobación cada 15 min por hogar; el resto sale sin tocar nada. El cron
-- diario (process_all_due_recurring) sigue cubriendo el resto.
-- ───────────────────────────────────────────────────────────────────────────

alter table public.households
  add column if not exists recurring_checked_at timestamptz;

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
   while d<=current_date and guard<600 loop
     insert into transactions(household_id,user_id,concept,amount,date,category_id,type,note,recurring_id)
     values(r.household_id,auth.uid(),r.concept,r.amount,d,r.category_id,r.type,r.note,r.id)
     on conflict do nothing;
     generated:=generated+1;
     d:=case r.frequency when 'weekly' then d+7 when 'monthly' then (d+interval '1 month')::date else (d+interval '1 year')::date end;
     guard:=guard+1;
   end loop;
   update recurring_transactions set next_date=d where id=r.id;
 end loop;
 return generated;
end $$;

grant execute on function public.process_due_recurring(uuid) to authenticated;

-- (Se retiró monthly_category_totals: el Histórico pasó a agruparse por periodos,
--  que pueden solaparse o no ser meses naturales, así que se calcula en cliente.)

-- ───────────────────────────────────────────────────────────────────────────
-- 2) get_session_bootstrap: 1 llamada en vez de 3
-- getSessionContext() hacía: get_my_households + user_preferences + households
-- (periodo activo), en serie. Esto lo une en una sola llamada.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.get_session_bootstrap()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  v_active_id uuid;
  v_hide boolean;
  v_target uuid;
  v_households jsonb;
  v_period jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('households', '[]'::jsonb, 'hide_amounts', false, 'active_period', null);
  end if;

  select active_household_id, coalesce(hide_amounts, false)
    into v_active_id, v_hide
  from user_preferences where user_id = auth.uid();

  -- Hogar activo: preferencia explícita o el más antiguo del que se es miembro.
  v_target := coalesce(
    v_active_id,
    (select hm0.household_id from household_members hm0 where hm0.user_id = auth.uid() order by hm0.created_at limit 1)
  );

  select coalesce(jsonb_agg(sub.obj order by sub.created_at), '[]'::jsonb)
    into v_households
  from (
    select jsonb_build_object(
             'household_id', h.id,
             'name', h.name,
             'member_count', (select count(*) from household_members m where m.household_id = h.id),
             'is_active', h.id = v_target,
             'partner_email', (select u.email::text from household_members m2 join auth.users u on u.id = m2.user_id
                               where m2.household_id = h.id and m2.user_id <> auth.uid() limit 1)
           ) as obj,
           hm.created_at as created_at
    from households h
    join household_members hm on hm.household_id = h.id and hm.user_id = auth.uid()
  ) sub;

  select to_jsonb(p) into v_period
  from periods p
  join households h on h.active_period_id = p.id
  where h.id = v_target;

  return jsonb_build_object(
    'households', coalesce(v_households, '[]'::jsonb),
    'hide_amounts', coalesce(v_hide, false),
    'active_period', v_period
  );
end $$;

grant execute on function public.get_session_bootstrap() to authenticated;
