-- TEMPO — People book del Label Copy (v0.66.0-alpha)
-- Contactos reutilizables (nombre + email/IPI/PRO/rol/publisher) que autocompletan la captura
-- del Label Copy entre tracks. Es a nivel EQUIPO (cruza artistas), no por artista.
-- data jsonb + team_id + RLS por equipo. Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.labelcopy_people (
  id          text primary key,          -- 'lcp-<slug-del-nombre>'
  team_id     uuid references public.teams(id) on delete cascade,
  data        jsonb,                      -- { id, name, email, ipi, pro, role, rol, publisher }
  updated_at  timestamptz not null default now()
);
create index if not exists lcpeople_team_idx on public.labelcopy_people (team_id);

alter table public.labelcopy_people enable row level security;

-- LECTURA: cualquier miembro del equipo (el people book es compartido por el equipo).
drop policy if exists "labelcopy_people read" on public.labelcopy_people;
create policy "labelcopy_people read" on public.labelcopy_people for select
  using (is_member(team_id));

-- ESCRITURA: editor/owner del equipo.
drop policy if exists "labelcopy_people write" on public.labelcopy_people;
create policy "labelcopy_people write" on public.labelcopy_people for all
  using      (is_editor(team_id))
  with check (is_editor(team_id));

-- NOTA: requiere is_member/is_editor (existentes, del setup base del equipo).
