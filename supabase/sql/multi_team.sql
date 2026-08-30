-- TEMPO — Soporte multi-equipo (v0.10.0-alpha)
-- Correr en Supabase → SQL Editor. Idempotente (create or replace / if not exists donde aplica).
-- Requiere las tablas y helpers existentes: teams, team_members, artists, launches,
-- is_member(team_id), is_editor(team_id), is_owner(team_id), provision_team(), accept_invite(tok).

-- ──────────────────────────────────────────────────────────────
-- 1) RPC: crear un equipo adicional y dejar al creador como owner.
--    Mismo patrón que provision_team(), pero con nombre y sin "solo si no tienes equipo".
-- ──────────────────────────────────────────────────────────────
create or replace function public.create_team(team_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'no autenticado';
  end if;

  insert into public.teams (name, owner)
  values (coalesce(nullif(trim(team_name), ''), 'Nuevo equipo'), auth.uid())
  returning id into new_id;

  insert into public.team_members (team_id, user_id, role, email)
  values (new_id, auth.uid(), 'owner',
          (select email from auth.users where id = auth.uid()));

  return new_id;
end;
$$;

grant execute on function public.create_team(text) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 2) Mover artistas/lanzamientos entre equipos.
--    La app hace: update artists set team_id = <destino> where id = ...
--    Para que el UPDATE de team_id pase RLS, la política de escritura debe permitir
--    la fila TANTO en el equipo de origen (USING) como en el de destino (WITH CHECK).
--    Si tus políticas actuales ya son `using (is_member(team_id)) with check (is_member(team_id))`
--    para UPDATE/ALL, NO necesitas hacer nada: mover funciona porque eres miembro de ambos.
--
--    Si tu política de UPDATE no tiene WITH CHECK explícito (o solo cubre el origen),
--    recréala así (ejemplo; ajusta el nombre a tu política real):
--
--    drop policy if exists "team write" on public.artists;
--    create policy "team write" on public.artists
--      for all
--      using (is_member(team_id))
--      with check (is_member(team_id));
--
--    drop policy if exists "team write" on public.launches;
--    create policy "team write" on public.launches
--      for all
--      using (is_member(team_id))
--      with check (is_member(team_id));
--
--    (Opcional, más estricto: usar is_editor(team_id) en vez de is_member para escritura.)

-- ──────────────────────────────────────────────────────────────
-- 3) Verificación rápida (opcional): listar mis equipos.
-- ──────────────────────────────────────────────────────────────
-- select tm.team_id, t.name, tm.role
-- from team_members tm join teams t on t.id = tm.team_id
-- where tm.user_id = auth.uid();
