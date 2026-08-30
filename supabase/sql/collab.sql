-- TEMPO — Fase CRM Colaborativo · Sprint 6 (Cimiento relacional)
-- Las entidades de ALTA ESCRITURA y multiusuario pasan a filas propias (fork arquitectónico §8.2):
--   tasks · comments · activity · notifications · approvals
-- RLS espejo de `tracks`/`launches`. comments y activity son APPEND-ONLY.
-- Correr en Supabase → SQL Editor. Idempotente. Requiere artist_privacy.sql (is_restricted_artist).

-- ─────────────────────────────────────────────────────────────
-- TASKS — objeto-tarea completo (§8.4). Columnas explícitas para lo que se filtra
-- (responsable/estado/prioridad/fecha/alcance) + data jsonb para el resto.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id           text primary key,
  team_id      uuid references public.teams(id) on delete cascade,
  artist_id    text,
  release_id   text,
  track_id     text,
  assignee     text,                         -- responsable (user id / persona / capability)
  departamento text,                         -- audio | legal | marketing | creativo | distrib | admin
  estado       text default 'pendiente',     -- backlog|pendiente|en_progreso|en_revision|aprobado|bloqueado|completado|atrasado
  priority     text default 'media',         -- baja|media|alta|urgente|critica
  due_date     date,
  approval_id  text,                          -- si es un gate de aprobación
  data         jsonb,                         -- titulo, descripcion, etiquetas[], checklistInterno[], deps[], adjuntos[], createdBy…
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists tasks_team_idx     on public.tasks (team_id);
create index if not exists tasks_release_idx   on public.tasks (release_id);
create index if not exists tasks_track_idx     on public.tasks (track_id);
create index if not exists tasks_assignee_idx  on public.tasks (assignee);
create index if not exists tasks_estado_idx    on public.tasks (estado);
create index if not exists tasks_due_idx       on public.tasks (due_date);

-- ─────────────────────────────────────────────────────────────
-- COMMENTS — por canal/departamento + @menciones. APPEND-ONLY.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.comments (
  id          text primary key,
  team_id     uuid references public.teams(id) on delete cascade,
  artist_id   text,
  release_id  text,
  track_id    text,
  task_id     text,
  canal       text default 'general',         -- general | legal | marketing | audio | interno-privado
  author      text,
  body        text,
  mentions    text[],                          -- @menciones (user ids)
  created_at  timestamptz not null default now()
);
create index if not exists comments_team_idx    on public.comments (team_id);
create index if not exists comments_release_idx  on public.comments (release_id);
create index if not exists comments_task_idx     on public.comments (task_id);
create index if not exists comments_created_idx  on public.comments (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- ACTIVITY — feed/log de actividad. APPEND-ONLY (seguro ante concurrencia por diseño).
-- ─────────────────────────────────────────────────────────────
create table if not exists public.activity (
  id          text primary key,
  team_id     uuid references public.teams(id) on delete cascade,
  artist_id   text,
  release_id  text,
  track_id    text,
  task_id     text,
  actor       text,                            -- quién hizo la acción (user id / email)
  verb        text,                            -- created|updated|status_changed|assigned|commented|approved|rejected|deleted…
  summary     text,                            -- texto corto legible
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_team_idx     on public.activity (team_id);
create index if not exists activity_release_idx   on public.activity (release_id);
create index if not exists activity_created_idx   on public.activity (created_at desc);

-- ─────────────────────────────────────────────────────────────
-- NOTIFICATIONS — in-app, mobile-first. Scoped al destinatario.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          text primary key,
  team_id     uuid references public.teams(id) on delete cascade,
  recipient   text,                            -- user id destinatario
  type        text,                            -- assigned | due_soon | overdue | approval_request | approved | comment | mention | system
  title       text,
  body        text,
  link        jsonb,                            -- {page, releaseId, trackId, taskId…}
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notif_team_idx      on public.notifications (team_id);
create index if not exists notif_recipient_idx  on public.notifications (recipient);
create index if not exists notif_read_idx       on public.notifications (recipient, is_read);

-- ─────────────────────────────────────────────────────────────
-- APPROVALS — gates de aprobación (9 tipos). Flujo propone→revisa→aprueba.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.approvals (
  id           text primary key,
  team_id      uuid references public.teams(id) on delete cascade,
  artist_id    text,
  release_id   text,
  track_id     text,
  task_id      text,
  gate         text,                           -- cover|master|label_copy|split_sheet|presupuesto|calendario|reporte|campana|publicacion
  estado       text default 'pendiente',       -- pendiente | en_revision | aprobado | rechazado
  requested_by text,
  decided_by   text,
  decided_at   timestamptz,
  note         text,
  data         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists approvals_team_idx    on public.approvals (team_id);
create index if not exists approvals_release_idx  on public.approvals (release_id);
create index if not exists approvals_gate_idx     on public.approvals (gate);

-- ═════════════════════════════════════════════════════════════
-- RLS — espejo de tracks/launches. Helper reusable por las 4 tablas con artist_id.
-- LECTURA: miembro del equipo + visibilidad de la ficha + alcance de artista restringido.
-- ESCRITURA: editor/owner del equipo, O el usuario-artista de su propia ficha.
-- ═════════════════════════════════════════════════════════════
-- Activación de RLS en sentencias estáticas (visibles para el linter de Supabase):
alter table public.tasks     enable row level security;
alter table public.comments  enable row level security;
alter table public.activity  enable row level security;
alter table public.approvals enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tasks','comments','activity','approvals'] loop
    execute format('drop policy if exists "%s read" on public.%I;', t, t);
    execute format($f$
      create policy "%s read" on public.%I for select using (
        is_member(team_id)
        and (artist_id is null
             or exists (select 1 from public.artists a where a.id = %I.artist_id and ((a.visibility = 'team') or (a.owner = auth.uid()))))
        and (not is_restricted_artist(team_id)
             or artist_id is null
             or exists (select 1 from public.artists a where a.id = %I.artist_id and a.user_id = auth.uid()))
      );$f$, t, t, t, t);
    execute format('drop policy if exists "%s write" on public.%I;', t, t);
    execute format($f$
      create policy "%s write" on public.%I for all
        using      (is_editor(team_id) or exists (select 1 from public.artists a where a.id = %I.artist_id and a.user_id = auth.uid()))
        with check (is_editor(team_id) or exists (select 1 from public.artists a where a.id = %I.artist_id and a.user_id = auth.uid()));
    $f$, t, t, t, t);
  end loop;
end $$;

-- NOTIFICATIONS — scoped al destinatario.
alter table public.notifications enable row level security;
drop policy if exists "notifications read" on public.notifications;
create policy "notifications read" on public.notifications for select using (
  is_member(team_id) and (recipient = auth.uid()::text or is_editor(team_id))
);
drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert" on public.notifications for insert
  with check (is_member(team_id));   -- cualquier miembro puede notificar a otro
drop policy if exists "notifications update" on public.notifications;
create policy "notifications update" on public.notifications for update
  using (is_member(team_id) and (recipient = auth.uid()::text or is_editor(team_id)));
drop policy if exists "notifications delete" on public.notifications;
create policy "notifications delete" on public.notifications for delete
  using (is_member(team_id) and (recipient = auth.uid()::text or is_editor(team_id)));

-- NOTA: requiere is_member/is_editor (existentes) e is_restricted_artist (artist_privacy.sql).
