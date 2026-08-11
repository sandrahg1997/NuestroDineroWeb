-- Ejecutar UNA VEZ en Supabase > SQL Editor si el proyecto ya estaba desplegado
-- antes de añadir la opción de eliminar un espacio. Los proyectos nuevos ya lo
-- incluyen en schema.sql.
create or replace function public.delete_household(p_household_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare is_owner boolean; space_count integer;
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 select exists(select 1 from household_members where household_id=p_household_id and user_id=auth.uid() and role='owner') into is_owner;
 if not is_owner then raise exception 'Solo la persona propietaria puede eliminar este espacio'; end if;
 select count(*) into space_count from household_members where user_id=auth.uid();
 if space_count<=1 then raise exception 'No puedes eliminar tu único espacio'; end if;
 delete from households where id=p_household_id;
end $$;
grant execute on function public.delete_household(uuid) to authenticated;
