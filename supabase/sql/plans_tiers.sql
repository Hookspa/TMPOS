-- TEMPO — Planes / Tiers / Asientos + contadores (v0.11.0-alpha)
-- Correr en Supabase → SQL Editor. Idempotente.

-- ──────────────────────────────────────────────────────────────
-- 1) teams: plan + contadores mensuales
-- ──────────────────────────────────────────────────────────────
alter table public.teams
  add column if not exists plan text not null default 'free'
    check (plan in ('free','pro','manager','custom')),
  add column if not exists ideas_generadas_mes int not null default 0,
  add column if not exists ideas_reset_date date not null default current_date,
  add column if not exists banco_refreshes int not null default 0,
  add column if not exists banco_refreshes_reset_date date not null default current_date;

-- ──────────────────────────────────────────────────────────────
-- 2) team_members: asiento + flag de "artista" (único por equipo)
-- ──────────────────────────────────────────────────────────────
alter table public.team_members
  add column if not exists is_artist boolean not null default false,
  add column if not exists seat_type text not null default 'included'
    check (seat_type in ('included','additional'));

create unique index if not exists one_artist_per_team
  on public.team_members (team_id)
  where is_artist = true;

-- ──────────────────────────────────────────────────────────────
-- 3) RPC: reset mensual de contadores (se llama al cargar sesión)
-- ──────────────────────────────────────────────────────────────
create or replace function public.reset_monthly_counters(tid uuid)
returns void language plpgsql security definer as $$
begin
  update public.teams set
    ideas_generadas_mes = 0,
    ideas_reset_date = current_date
  where id = tid and date_trunc('month', ideas_reset_date) < date_trunc('month', current_date);

  update public.teams set
    banco_refreshes = 0,
    banco_refreshes_reset_date = current_date
  where id = tid and date_trunc('month', banco_refreshes_reset_date) < date_trunc('month', current_date);
end;
$$;
grant execute on function public.reset_monthly_counters(uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4) RLS reforzada por rol — *** NO HACER NADA ***
--    Verificado en este proyecto (2026-06-06): las políticas existentes YA cumplen
--    los requisitos de la spec (y mejor: la lectura respeta `visibility`/'Solo yo').
--    NO recrear estas políticas — hacerlo degradaría la lectura. Dejado como referencia:
--
--      artists "artists write"  ALL    using is_editor(team_id) check is_editor(team_id)   ✓ lector no escribe
--      artists "artists read"   SELECT using is_member(team_id) AND (visibility='team' OR owner=auth.uid())  ✓
--      launches "launches write" ALL   using is_editor(team_id) check is_editor(team_id)   ✓
--      launches "launches read" SELECT using is_member(...) AND exists(artist visible)      ✓
--      team_members "members manage" UPDATE using is_owner(team_id)                          ✓ solo owner gestiona
--      team_members "members remove" DELETE using is_owner(team_id)                          ✓
--      team_members "members read"   SELECT using is_member(team_id)                         ✓
--
--    => Correr SOLO las secciones 1, 2 y 3 de este archivo.
--
--    Para verificar en el futuro:
--    select tablename, policyname, cmd, qual, with_check
--    from pg_policies where schemaname='public'
--      and tablename in ('artists','launches','team_members') order by tablename, cmd;
--
--    NOTA: con `is_editor` en WRITE de artists, mover un artista entre equipos
--    (UPDATE team_id) requiere ser editor/owner en AMBOS equipos (origen y destino).
