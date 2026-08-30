-- TEMPO — Sprint 10: Permisos / roles / workspace (spine 10a–10c)
-- Correr en Supabase → SQL Editor. Idempotente (if not exists / create or replace).
-- Requiere: teams, team_members, invites, is_member/is_editor/is_owner, provision_team(), accept_invite(tok).
-- El cliente (team.js) degrada limpio si esto aún no se corre (selects con fallback en cascada).

-- ──────────────────────────────────────────────────────────────
-- 1) team_members: rol de negocio (preset) + alcance del miembro
--    `role` (owner/editor/lector) sigue siendo la fuente de verdad de RLS.
--    `seat_role` es el preset de NEGOCIO (admin/abogado/marketing/…) que la UI usa para la matriz de caps.
--    `scope` (jsonb) = alcance opcional { artistIds:[], releaseIds:[] }; null = todo el workspace.
-- ──────────────────────────────────────────────────────────────
alter table public.team_members
  add column if not exists seat_role text,
  add column if not exists scope jsonb;

-- Necesario para el `on conflict (team_id, user_id)` de accept_invite (no-op si ya existe la PK/único).
create unique index if not exists team_members_team_user_uidx
  on public.team_members (team_id, user_id);

-- ──────────────────────────────────────────────────────────────
-- 2) invites: rol + alcance + expiración + revocación + uso
-- ──────────────────────────────────────────────────────────────
alter table public.invites
  add column if not exists seat_role  text,
  add column if not exists scope      jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists email      text,
  add column if not exists revoked    boolean not null default false,
  add column if not exists used_at    timestamptz;

-- ──────────────────────────────────────────────────────────────
-- 3) RLS de invites: el equipo (editores) gestiona sus invitaciones; el invitado las canjea por RPC.
--    (Si ya tienes políticas de invites, estas las reemplazan por nombre.)
-- ──────────────────────────────────────────────────────────────
alter table public.invites enable row level security;

drop policy if exists "invites manage" on public.invites;
create policy "invites manage" on public.invites for all
  using (is_editor(team_id)) with check (is_editor(team_id));

-- ──────────────────────────────────────────────────────────────
-- 4) Mapeo preset de negocio → rol DB que entiende RLS.
-- ──────────────────────────────────────────────────────────────
create or replace function public.seat_to_db_role(seat text)
returns text language sql immutable as $$
  select case
    when seat = 'owner'  then 'owner'
    when seat = 'lector' then 'lector'
    when seat is null    then 'editor'
    else 'editor'
  end;
$$;

-- ──────────────────────────────────────────────────────────────
-- 5) accept_invite(tok): canjea una invitación honrando rol/alcance/expiración/revocación.
--    Devuelve el team_id (uuid) o lanza excepción si la invitación no es válida.
--    Idempotente para el mismo usuario: si ya es miembro, solo actualiza seat_role/scope y marca usada.
-- ──────────────────────────────────────────────────────────────
create or replace function public.accept_invite(tok text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv  public.invites%rowtype;
  uid  uuid := auth.uid();
  mail text;
begin
  if uid is null then
    raise exception 'no autenticado';
  end if;

  select * into inv from public.invites where token = tok;
  if not found then
    raise exception 'invitación no encontrada';
  end if;
  if inv.revoked then
    raise exception 'invitación revocada';
  end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'invitación expirada';
  end if;
  -- used_at: permitimos re-aceptar por el mismo usuario (idempotente); bloqueamos si la usó alguien más.
  if inv.used_at is not null and inv.used_by is distinct from uid then
    raise exception 'invitación ya utilizada';
  end if;

  select email into mail from auth.users where id = uid;

  insert into public.team_members (team_id, user_id, role, email, seat_role, scope)
  values (inv.team_id, uid, public.seat_to_db_role(inv.seat_role), mail,
          coalesce(inv.seat_role, 'editor'), inv.scope)
  on conflict (team_id, user_id) do update
    set seat_role = excluded.seat_role,
        scope     = excluded.scope,
        role      = excluded.role;

  update public.invites
    set used_at = coalesce(used_at, now()), used_by = uid
    where token = tok;

  return inv.team_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;

-- Nota: si `invites` no tiene la columna used_by, agrégala (la usa el RPC para la idempotencia):
alter table public.invites add column if not exists used_by uuid;

-- ──────────────────────────────────────────────────────────────
-- 6) Branding del workspace (Sprint 10d): color de acento + logo + nombre de marca.
-- ──────────────────────────────────────────────────────────────
alter table public.teams
  add column if not exists brand_color text,
  add column if not exists logo_url    text,
  add column if not exists brand_name  text;

-- ──────────────────────────────────────────────────────────────
-- 7) Auditoría de archivos (Sprint 10e): registro append-only de ver/copiar/descargar.
--    Asientos (seat_type) ya existen en plans_tiers.sql — no se recrean aquí.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  actor       text,                       -- email o id de quien hizo la acción
  action      text not null,              -- ver | copiar | descargar
  target_type text,                       -- asset | reporte | ...
  target_id   text,
  label       text,                       -- descripción legible (nombre del archivo · release)
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_team_created_idx on public.audit_log (team_id, created_at desc);

alter table public.audit_log enable row level security;

-- Cualquier miembro puede registrar un evento (insert); solo editores/gestión lo leen.
drop policy if exists "audit insert" on public.audit_log;
create policy "audit insert" on public.audit_log for insert with check (is_member(team_id));
drop policy if exists "audit read" on public.audit_log;
create policy "audit read" on public.audit_log for select using (is_editor(team_id));

-- ──────────────────────────────────────────────────────────────
-- 8) Verificación rápida (opcional):
-- select user_id, role, seat_role, scope, seat_type from team_members where team_id = '<tu-team-id>';
-- select token, seat_role, expires_at, revoked, used_at from invites where team_id = '<tu-team-id>';
-- select brand_color, logo_url, brand_name, plan from teams where id = '<tu-team-id>';
-- select actor, action, target_type, label, created_at from audit_log where team_id = '<tu-team-id>' order by created_at desc limit 20;
-- ──────────────────────────────────────────────────────────────
