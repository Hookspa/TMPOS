-- TEMPO — Tabla tracks (Sprint 0 del pivote a CRM)
-- La canción durable (identidad por ISRC). Mismo patrón que `launches`:
-- data jsonb + team_id + artist_id (text) + RLS por equipo/visibilidad/artista.
-- Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.tracks (
  id          text primary key,
  artist_id   text,
  team_id     uuid references public.teams(id) on delete cascade,
  data        jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists tracks_team_idx   on public.tracks (team_id);
create index if not exists tracks_artist_idx on public.tracks (artist_id);

alter table public.tracks enable row level security;

-- RLS espejo de launches:
-- LECTURA: miembro del equipo, respeta visibilidad de la ficha del artista,
--          y si es artista restringido solo ve los de SU ficha.
drop policy if exists "tracks read" on public.tracks;
create policy "tracks read" on public.tracks for select using (
  is_member(team_id)
  and exists (select 1 from public.artists a where a.id = tracks.artist_id and ((a.visibility = 'team') or (a.owner = auth.uid())))
  and (not is_restricted_artist(team_id)
       or exists (select 1 from public.artists a where a.id = tracks.artist_id and a.user_id = auth.uid()))
);

-- ESCRITURA: editor/owner del equipo, O el usuario-artista de su propia ficha.
drop policy if exists "tracks write" on public.tracks;
create policy "tracks write" on public.tracks for all
  using      (is_editor(team_id) or exists (select 1 from public.artists a where a.id = tracks.artist_id and a.user_id = auth.uid()))
  with check (is_editor(team_id) or exists (select 1 from public.artists a where a.id = tracks.artist_id and a.user_id = auth.uid()));

-- NOTA: requiere is_member/is_editor (existentes) e is_restricted_artist (de artist_privacy.sql).
-- Si aún no corriste artist_privacy.sql, córrelo antes (o quita la condición is_restricted_artist).
