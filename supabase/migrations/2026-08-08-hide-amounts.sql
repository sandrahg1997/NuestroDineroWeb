-- Ejecutar UNA VEZ en Supabase > SQL Editor si el proyecto ya estaba desplegado
-- antes de añadir el "modo oculto" (difuminar importes). Los proyectos nuevos ya
-- lo incluyen en schema.sql.
alter table public.user_preferences add column if not exists hide_amounts boolean not null default false;

create or replace function public.set_hide_amounts(p_hidden boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 insert into user_preferences(user_id,hide_amounts) values(auth.uid(),p_hidden)
   on conflict(user_id) do update set hide_amounts=excluded.hide_amounts;
end $$;
grant execute on function public.set_hide_amounts(boolean) to authenticated;
