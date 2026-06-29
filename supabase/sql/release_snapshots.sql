-- Tempo OS — B3 (captura "ahora"): snapshot del rollup operativo al cierre de un release.
-- ⚠️ Esta NO es la tabla k-anon cross-tenant (`release_benchmarks`, diferida a ≥3 releases).
-- Esta es la captura del PROPIO equipo: RLS por team_id (cada quien ve solo lo suyo). El cliente
-- la calcula y hace upsert best-effort; el primario es localStorage. Idempotente por release_id.
-- Correr en Supabase → SQL Editor. Idempotente.

create table if not exists public.release_snapshots (
  release_id    text primary key,                 -- idempotente: 1 fila por release
  team_id       uuid references public.teams(id) on delete cascade,
  genero        text,
  tipo_release  text,
  etapa_carrera text,
  completitud   int,
  data          jsonb not null,                   -- snapshot completo (tareas/cycle/gates/lead/espaciado/finanzas/resultado)
  captured_at   timestamptz not null default now()
);
create index if not exists release_snapshots_team_idx on public.release_snapshots (team_id);

alter table public.release_snapshots enable row level security;

-- Lectura/gestión: miembros del equipo (RLS espejo de launches). El equipo solo ve sus propios snapshots.
drop policy if exists "snapshots read" on public.release_snapshots;
create policy "snapshots read" on public.release_snapshots
  for select to authenticated using (is_member(team_id));

drop policy if exists "snapshots write" on public.release_snapshots;
create policy "snapshots write" on public.release_snapshots
  for all to authenticated using (is_editor(team_id)) with check (is_editor(team_id));

-- NOTA: requiere is_member/is_editor (helpers existentes). La AGREGACIÓN cross-tenant con k-anon
-- (medianas del género, correlación proceso→resultado) NO vive aquí — es `release_benchmarks` +
-- RPC service-role, diferido hasta ≥3 releases cerrados (ver TEMPO-B3-spec §3.2/§9).
