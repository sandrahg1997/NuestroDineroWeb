-- Tiempo real: cuando alguien del espacio cambia algo, el resto de miembros lo
-- ve sin recargar. Cada cambio emite por Broadcast un aviso ligero (tabla y
-- operación, sin datos) al canal privado "household:<id>"; la app escucha ese
-- canal y vuelve a pedir los datos.
--
-- Se usa Broadcast y no postgres_changes porque este último no puede filtrar
-- los DELETE por hogar: cada borrado de cualquier usuario llegaría a todos.

create or replace function public.broadcast_household_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if tg_op = 'DELETE' then h := old.household_id; else h := new.household_id; end if;
  -- Si el aviso falla, el guardado no debe fallar con él.
  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op),
      'change',
      'household:' || h::text,
      true
    );
  exception when others then null;
  end;
  return null;
end $$;

drop trigger if exists broadcast_change on public.transactions;
create trigger broadcast_change after insert or update or delete on public.transactions
  for each row execute function public.broadcast_household_change();
drop trigger if exists broadcast_change on public.categories;
create trigger broadcast_change after insert or update or delete on public.categories
  for each row execute function public.broadcast_household_change();
drop trigger if exists broadcast_change on public.budgets;
create trigger broadcast_change after insert or update or delete on public.budgets
  for each row execute function public.broadcast_household_change();
drop trigger if exists broadcast_change on public.recurring_transactions;
create trigger broadcast_change after insert or update or delete on public.recurring_transactions
  for each row execute function public.broadcast_household_change();
drop trigger if exists broadcast_change on public.periods;
create trigger broadcast_change after insert or update or delete on public.periods
  for each row execute function public.broadcast_household_change();
drop trigger if exists broadcast_change on public.challenges;
create trigger broadcast_change after insert or update or delete on public.challenges
  for each row execute function public.broadcast_household_change();
drop trigger if exists broadcast_change on public.period_reviews;
create trigger broadcast_change after insert or update or delete on public.period_reviews
  for each row execute function public.broadcast_household_change();

-- Solo los miembros del hogar pueden escuchar su canal.
drop policy if exists "household members receive changes" on realtime.messages;
create policy "household members receive changes" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part(realtime.topic(), ':', 1) = 'household'
    and public.is_household_member(split_part(realtime.topic(), ':', 2)::uuid)
  );
