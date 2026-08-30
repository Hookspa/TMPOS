-- TEMPO — Tabla reports (Módulo de reportes · Fase 2)
-- Guarda los reportes de lanzamiento generados (snapshot del Launch Report Generator)
-- para listarlos/compararlos a lo largo del tiempo (temporalidades).
-- Mismo patrón que `tracks`/`launches`: data jsonb + team_id + artist_id + RLS por equipo.
-- Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.reports (
  id          text primary key,            -- id generado en el cliente
  team_id     uuid references public.teams(id) on delete cascade,
  artist_id   text,
  release_id  text,                         -- id del lanzamiento (launches.id) sobre el que se reportó
  track_id    text,                         -- opcional: si el reporte es de una canción específica
  scenario    text,                         -- nivel del reporte (hoy siempre 'ideal')
  data        jsonb,                        -- snapshot completo (identidad, datos, aiInsights, etc.)
  created_at  timestamptz not null default now()
);
create index if not exists reports_team_idx    on public.reports (team_id);
create index if not exists reports_release_idx  on public.reports (release_id);
create index if not exists reports_artist_idx   on public.reports (artist_id);
create index if not exists reports_created_idx  on public.reports (created_at desc);

alter table public.reports enable row level security;

-- RLS espejo de tracks/launches:
-- LECTURA: miembro del equipo, respeta visibilidad de la ficha del artista,
--          y si es artista restringido solo ve los de SU ficha.
drop policy if exists "reports read" on public.reports;
create policy "reports read" on public.reports for select using (
  is_member(team_id)
  and (reports.artist_id is null
       or exists (select 1 from public.artists a where a.id = reports.artist_id and ((a.visibility = 'team') or (a.owner = auth.uid()))))
  and (not is_restricted_artist(team_id)
       or reports.artist_id is null
       or exists (select 1 from public.artists a where a.id = reports.artist_id and a.user_id = auth.uid()))
);

-- ESCRITURA: editor/owner del equipo, O el usuario-artista de su propia ficha.
drop policy if exists "reports write" on public.reports;
create policy "reports write" on public.reports for all
  using      (is_editor(team_id) or exists (select 1 from public.artists a where a.id = reports.artist_id and a.user_id = auth.uid()))
  with check (is_editor(team_id) or exists (select 1 from public.artists a where a.id = reports.artist_id and a.user_id = auth.uid()));

-- NOTA: requiere is_member/is_editor (existentes) e is_restricted_artist (de artist_privacy.sql).
-- Si aún no corriste artist_privacy.sql, córrelo antes (o quita la condición is_restricted_artist).
