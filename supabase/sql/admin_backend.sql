-- TEMPO — Backend del super-admin (v0.12.0-alpha)
-- Correr en Supabase → SQL Editor. Idempotente.
-- Asume helpers existentes: is_member(team_id), is_editor(team_id), is_owner(team_id).

-- ════════════════════════════════════════════════════════════
-- 1) SUPER ADMINS (quién ve el backend, verificado en el SERVIDOR)
-- ════════════════════════════════════════════════════════════
create table if not exists public.super_admins (
  email text primary key,
  added_at timestamptz not null default now()
);
insert into public.super_admins (email) values ('josh@hookspa.com')
  on conflict (email) do nothing;

-- Función segura (SECURITY DEFINER → no recursa con la RLS de la tabla)
create or replace function public.is_super_admin()
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.super_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_super_admin() to authenticated;

alter table public.super_admins enable row level security;
drop policy if exists "super_admins read"  on public.super_admins;
drop policy if exists "super_admins write" on public.super_admins;
create policy "super_admins read"  on public.super_admins for select using (is_super_admin());
create policy "super_admins write" on public.super_admins for all
  using (is_super_admin()) with check (is_super_admin());

-- ════════════════════════════════════════════════════════════
-- 2) AI_USAGE (uso/costo del API de IA) — la Edge Function inserta aquí
-- ════════════════════════════════════════════════════════════
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  team_id    uuid references public.teams(id) on delete set null,
  user_id    uuid,
  model      text,
  in_tokens  int    not null default 0,
  out_tokens int    not null default 0,
  cost       numeric not null default 0,
  feature    text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_team_idx    on public.ai_usage (team_id);
create index if not exists ai_usage_created_idx on public.ai_usage (created_at);

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage read" on public.ai_usage;
-- Cada equipo ve su propio uso; el super-admin ve todo. (El insert lo hace la Edge
-- Function con service_role, que ignora RLS — no se necesita policy de insert.)
create policy "ai_usage read" on public.ai_usage for select
  using (is_member(team_id) or is_super_admin());

-- ════════════════════════════════════════════════════════════
-- 3) DISCOUNT_CODES (códigos de descuento para clientes)
-- ════════════════════════════════════════════════════════════
create table if not exists public.discount_codes (
  code        text primary key,
  kind        text not null default 'percent' check (kind in ('percent','fixed')),
  value       numeric not null default 0,         -- % (0-100) o monto fijo
  plan        text,                                -- aplica a este plan; null = cualquiera
  max_uses    int,                                 -- null = ilimitado
  used_count  int not null default 0,
  expires_at  date,                                -- null = sin vencimiento
  active      boolean not null default true,
  note        text,
  created_at  timestamptz not null default now()
);
alter table public.discount_codes enable row level security;
drop policy if exists "discounts super read"  on public.discount_codes;
drop policy if exists "discounts super write" on public.discount_codes;
create policy "discounts super read"  on public.discount_codes for select using (is_super_admin());
create policy "discounts super write" on public.discount_codes for all
  using (is_super_admin()) with check (is_super_admin());

-- ════════════════════════════════════════════════════════════
-- 4) teams.status (activar / suspender cuentas)
-- ════════════════════════════════════════════════════════════
alter table public.teams
  add column if not exists status text not null default 'active'
    check (status in ('active','suspended'));

-- ════════════════════════════════════════════════════════════
-- 5) RPCs de SOLO-LECTURA para el dashboard (todas verifican super-admin)
-- ════════════════════════════════════════════════════════════
create or replace function public.admin_overview()
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  select json_build_object(
    'totals', json_build_object(
      'teams',         (select count(*) from teams),
      'users',         (select count(distinct user_id) from team_members),
      'active',        (select count(*) from teams where status = 'active'),
      'suspended',     (select count(*) from teams where status = 'suspended'),
      'ia_calls',      (select count(*) from ai_usage),
      'ia_cost',       (select coalesce(sum(cost),0) from ai_usage),
      'ia_cost_month', (select coalesce(sum(cost),0) from ai_usage where created_at > date_trunc('month', now()))
    ),
    'by_plan', (select coalesce(json_agg(p),'[]'::json) from (
      select plan, count(*) as n from teams group by plan order by plan
    ) p),
    'teams', (select coalesce(json_agg(t),'[]'::json) from (
      select tm.id, tm.name, tm.plan, tm.status,
             tm.ideas_generadas_mes, tm.banco_refreshes,
             (select count(*) from team_members m where m.team_id = tm.id) as members,
             (select count(*) from artists  a where a.team_id = tm.id) as artists,
             (select count(*) from launches l where l.team_id = tm.id) as launches,
             (select coalesce(sum(cost),0) from ai_usage u where u.team_id = tm.id) as ia_cost,
             (select max(created_at) from ai_usage u where u.team_id = tm.id) as last_ia
      from teams tm order by tm.name
    ) t)
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_team_members(tid uuid)
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  select coalesce(json_agg(m),'[]'::json) into result from (
    select user_id, email, role, is_artist from team_members where team_id = tid order by role
  ) m;
  return result;
end; $$;
grant execute on function public.admin_team_members(uuid) to authenticated;

create or replace function public.admin_usage(days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  select json_build_object(
    'by_model', (select coalesce(json_agg(x),'[]'::json) from (
      select model, count(*) as calls, sum(in_tokens) as in_tok,
             sum(out_tokens) as out_tok, sum(cost) as cost
      from ai_usage where created_at > now() - (days || ' days')::interval
      group by model order by sum(cost) desc
    ) x),
    'daily', (select coalesce(json_agg(d),'[]'::json) from (
      select date_trunc('day', created_at)::date as day, count(*) as calls, sum(cost) as cost
      from ai_usage where created_at > now() - (days || ' days')::interval
      group by 1 order by 1
    ) d),
    'recent', (select coalesce(json_agg(r),'[]'::json) from (
      select u.created_at, u.model, u.feature, u.in_tokens, u.out_tokens, u.cost, t.name as team
      from ai_usage u left join teams t on t.id = u.team_id
      order by u.created_at desc limit 50
    ) r)
  ) into result;
  return result;
end; $$;
grant execute on function public.admin_usage(int) to authenticated;

-- ════════════════════════════════════════════════════════════
-- 6) RPCs de MODIFICACIÓN (todas verifican super-admin)
-- ════════════════════════════════════════════════════════════
create or replace function public.admin_set_plan(tid uuid, new_plan text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  if new_plan not in ('free','pro','manager','custom') then raise exception 'plan invalido'; end if;
  update teams set plan = new_plan where id = tid;
end; $$;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;

create or replace function public.admin_set_status(tid uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  if new_status not in ('active','suspended') then raise exception 'status invalido'; end if;
  update teams set status = new_status where id = tid;
end; $$;
grant execute on function public.admin_set_status(uuid, text) to authenticated;

create or replace function public.admin_reset_counters(tid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  update teams set ideas_generadas_mes = 0, ideas_reset_date = current_date,
                   banco_refreshes = 0,     banco_refreshes_reset_date = current_date
  where id = tid;
end; $$;
grant execute on function public.admin_reset_counters(uuid) to authenticated;

create or replace function public.admin_set_member_role(tid uuid, uid uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  if new_role not in ('owner','editor','lector') then raise exception 'rol invalido'; end if;
  update team_members set role = new_role where team_id = tid and user_id = uid;
end; $$;
grant execute on function public.admin_set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.admin_set_artist(tid uuid, uid uuid, val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'no autorizado'; end if;
  if val then
    update team_members set is_artist = false where team_id = tid;
    update team_members set is_artist = true  where team_id = tid and user_id = uid;
  else
    update team_members set is_artist = false where team_id = tid and user_id = uid;
  end if;
end; $$;
grant execute on function public.admin_set_artist(uuid, uuid, boolean) to authenticated;
