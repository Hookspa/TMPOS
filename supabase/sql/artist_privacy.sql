-- TEMPO — Privacidad del artista (v0.13.0-alpha)
-- El usuario-artista (ligado a una ficha) solo ve SU ficha y lo suyo (perfil, lanzamientos,
-- contenido, calendario). El staff (owner/editor/lector) ve a todos los artistas.
-- Correr en Supabase → SQL Editor. Idempotente.

-- ── 1) Vínculo usuario-artista ↔ ficha ──
alter table public.artists add column if not exists user_id uuid;  -- el usuario que ES este artista

-- Permitir VARIOS artistas-usuario por equipo (un manager/label maneja varios).
-- (Antes había índice "un artista por equipo" sobre team_members.is_artist; ya no aplica.)
drop index if exists public.one_artist_per_team;
-- Como mucho una ficha por usuario-artista dentro de un equipo:
create unique index if not exists artist_user_per_team
  on public.artists (team_id, user_id) where user_id is not null;

-- ── 2) ¿El que llama es un usuario-artista (ligado) y NO es owner? → restringido ──
--    (SECURITY DEFINER evita recursión con la RLS de artists.)
create or replace function public.is_restricted_artist(tid uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (select 1 from artists a where a.team_id = tid and a.user_id = auth.uid())
     and not is_owner(tid);
$$;
grant execute on function public.is_restricted_artist(uuid) to authenticated;

-- ── 3) RLS de artists: lectura y escritura ──
drop policy if exists "artists read"  on public.artists;
drop policy if exists "artists write" on public.artists;

-- Lee si: es miembro, respeta visibilidad, y (no es artista restringido O es su propia ficha)
create policy "artists read" on public.artists for select using (
  is_member(team_id)
  and ((visibility = 'team') or (owner = auth.uid()))
  and (not is_restricted_artist(team_id) or user_id = auth.uid())
);

-- Escribe si: es editor/owner del equipo, O es el usuario-artista de SU propia ficha
create policy "artists write" on public.artists for all
  using      (is_editor(team_id) or user_id = auth.uid())
  with check (is_editor(team_id) or user_id = auth.uid());

-- ── 4) RLS de launches: el artista restringido solo ve/edita los de SU ficha ──
drop policy if exists "launches read"  on public.launches;
drop policy if exists "launches write" on public.launches;

create policy "launches read" on public.launches for select using (
  is_member(team_id)
  and exists (select 1 from artists a where a.id = launches.artist_id and ((a.visibility = 'team') or (a.owner = auth.uid())))
  and (not is_restricted_artist(team_id)
       or exists (select 1 from artists a where a.id = launches.artist_id and a.user_id = auth.uid()))
);

create policy "launches write" on public.launches for all
  using      (is_editor(team_id) or exists (select 1 from artists a where a.id = launches.artist_id and a.user_id = auth.uid()))
  with check (is_editor(team_id) or exists (select 1 from artists a where a.id = launches.artist_id and a.user_id = auth.uid()));

-- NOTA: con 1 solo artista, "ver solo el suyo" = ver todo (no hay nada más), así que no
-- hace falta condicionar por número de artistas: la restricción solo "se nota" con 2+.
-- El staff (owner/editor/lector) nunca es is_restricted_artist → ve a todos.
