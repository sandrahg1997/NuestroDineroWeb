-- Ejecutar UNA VEZ en Supabase > SQL Editor si el proyecto ya estaba desplegado
-- antes de añadir "Eliminar cuenta". Los proyectos nuevos ya la incluyen en schema.sql.
--
-- Sin esto, borrar un usuario falla con un error de clave foránea en cuanto
-- tiene algún movimiento registrado (transactions.user_id lo referenciaba con
-- NOT NULL y sin acción ON DELETE).
alter table public.transactions alter column user_id drop not null;
alter table public.transactions drop constraint if exists transactions_user_id_fkey;
alter table public.transactions add constraint transactions_user_id_fkey foreign key (user_id) references auth.users(id) on delete set null;
