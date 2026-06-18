-- Tempo OS — Tabla community_refs (Banco de Referencias · pool de comunidad) + moderación ligera
-- Las referencias personalizadas son PRIVADAS por defecto (viven en localStorage del usuario).
-- Cuando el usuario marca "Compartir con la comunidad", su snapshot se sube aquí y queda
-- visible para CUALQUIER usuario autenticado (pool compartido cross-equipo).
-- Moderación ligera: cualquiera puede REPORTAR (community_flags); el super-admin puede OCULTAR (status='hidden').
-- Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.community_refs (
  id          text primary key,            -- id de la referencia (mismo que el custom local: 'custom-...')
  owner       uuid references auth.users(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete set null,
  author      text,                         -- nombre/correo para crédito en la UI
  data        jsonb not null,               -- snapshot: title, hook, cat, for, link, thumb, comentarios, icon
  status      text not null default 'active',  -- active | hidden (moderación)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Por si la tabla ya existía de una versión previa sin la columna:
alter table public.community_refs add column if not exists status text not null default 'active';
create index if not exists community_refs_owner_idx   on public.community_refs (owner);
create index if not exists community_refs_created_idx  on public.community_refs (created_at desc);

alter table public.community_refs enable row level security;

-- LECTURA: el pool activo lo ve cualquier autenticado; el dueño y el super-admin ven también las ocultas.
drop policy if exists "community read" on public.community_refs;
create policy "community read" on public.community_refs
  for select to authenticated
  using (status = 'active' or owner = auth.uid() or is_super_admin());

-- ESCRITURA del dueño: cada quien gestiona SOLO las suyas (insert/update/delete por owner = auth.uid()).
drop policy if exists "community insert own" on public.community_refs;
create policy "community insert own" on public.community_refs
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "community update own" on public.community_refs;
create policy "community update own" on public.community_refs
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "community delete own" on public.community_refs;
create policy "community delete own" on public.community_refs
  for delete to authenticated using (owner = auth.uid());

-- MODERACIÓN: el super-admin puede actualizar (ocultar) cualquier fila.
drop policy if exists "community moderate" on public.community_refs;
create policy "community moderate" on public.community_refs
  for update to authenticated using (is_super_admin()) with check (is_super_admin());

-- ── Reportes de la comunidad (flags) ──
create table if not exists public.community_flags (
  ref_id      text references public.community_refs(id) on delete cascade,
  reporter    uuid references auth.users(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (ref_id, reporter)            -- un reporte por usuario por referencia
);
alter table public.community_flags enable row level security;

-- Cualquier autenticado reporta (solo su propia fila); el super-admin lee todos los reportes.
drop policy if exists "flags insert own" on public.community_flags;
create policy "flags insert own" on public.community_flags
  for insert to authenticated with check (reporter = auth.uid());

drop policy if exists "flags read" on public.community_flags;
create policy "flags read" on public.community_flags
  for select to authenticated using (reporter = auth.uid() or is_super_admin());

-- NOTA: la lectura/moderación usa is_super_admin() (de admin_backend.sql). Si aún no lo corriste,
-- córrelo antes, o reemplaza is_super_admin() por (false) temporalmente para que el pool sea solo activo.
