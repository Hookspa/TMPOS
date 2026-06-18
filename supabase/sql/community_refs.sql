-- Tempo OS — Tabla community_refs (Banco de Referencias · pool de comunidad)
-- Las referencias personalizadas son PRIVADAS por defecto (viven en localStorage del usuario).
-- Cuando el usuario marca "Compartir con la comunidad", su snapshot se sube aquí y queda
-- visible para CUALQUIER usuario autenticado (pool compartido cross-equipo).
-- Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.community_refs (
  id          text primary key,            -- id de la referencia (mismo que el custom local: 'custom-...')
  owner       uuid references auth.users(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete set null,
  author      text,                         -- nombre/correo para crédito en la UI
  data        jsonb not null,               -- snapshot: title, hook, cat, for, link, thumb, comentarios, icon
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists community_refs_owner_idx   on public.community_refs (owner);
create index if not exists community_refs_created_idx  on public.community_refs (created_at desc);

alter table public.community_refs enable row level security;

-- LECTURA: cualquier usuario autenticado ve TODO el pool de la comunidad.
drop policy if exists "community read" on public.community_refs;
create policy "community read" on public.community_refs
  for select to authenticated using (true);

-- ESCRITURA: cada quien gestiona SOLO las suyas (insert/update/delete por owner = auth.uid()).
drop policy if exists "community insert own" on public.community_refs;
create policy "community insert own" on public.community_refs
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "community update own" on public.community_refs;
create policy "community update own" on public.community_refs
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "community delete own" on public.community_refs;
create policy "community delete own" on public.community_refs
  for delete to authenticated using (owner = auth.uid());

-- NOTA: no depende de helpers de equipo (is_member/is_editor). Es un pool global a propósito.
-- Si en el futuro quieres moderación, agrega una columna `status` y filtra en la política de lectura.
