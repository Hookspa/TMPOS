-- TEMPO — tope mensual de gasto de IA por Equipo.
-- Correr en Supabase -> SQL Editor antes de desplegar la Edge Function claude.
-- Idempotente. Todas las mutaciones quedan reservadas a service_role.

-- Una lectura de sum(cost) seguida de una llamada al proveedor no basta: dos
-- requests concurrentes podrían observar el mismo saldo. Esta tabla conserva
-- una reserva por request antes de gastar. La reserva se sustituye por el coste
-- real en ai_usage al finalizar. Las reservas pendientes caducan después de
-- cinco minutos: supera la suma máxima de los timeouts de conteo y generación,
-- más los reintentos de finalización, y evita bloqueos fantasma.
create table if not exists public.ai_spend_reservations (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  user_id       uuid not null,
  model         text not null,
  feature       text,
  reserved_cost numeric not null check (reserved_cost > 0),
  period_start  timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists ai_spend_reservations_team_period_idx
  on public.ai_spend_reservations (team_id, period_start);

-- Tombstones sin contenido del Equipo. Permiten que finalize/release distingan
-- un reintento exitoso de una reserva desconocida aunque la fila pendiente ya
-- se haya eliminado. La PK también impide aplicar el mismo resultado dos veces.
create table if not exists public.ai_spend_reservation_outcomes (
  reservation_id uuid primary key,
  team_id         uuid not null references public.teams(id) on delete cascade,
  user_id         uuid not null,
  outcome         text not null check (outcome in ('finalized', 'released')),
  completed_at    timestamptz not null default now()
);

create index if not exists ai_spend_reservation_outcomes_team_completed_idx
  on public.ai_spend_reservation_outcomes (team_id, completed_at);

alter table public.ai_spend_reservations enable row level security;
alter table public.ai_spend_reservation_outcomes enable row level security;
revoke all on table public.ai_spend_reservations from public, anon, authenticated;
revoke all on table public.ai_spend_reservation_outcomes from public, anon, authenticated;

-- Reserva el coste máximo de una llamada dentro de una transacción. El lock de
-- la fila del Equipo serializa todas sus reservas/finalizaciones sin bloquear a
-- otros Equipos. También vuelve a comprobar la membresía: el uid procede del JWT
-- validado por la Edge Function, nunca del body del cliente.
create or replace function public.reserve_ai_spend(
  p_team_id uuid,
  p_user_id uuid,
  p_model text,
  p_feature text,
  p_reserved_cost numeric,
  p_monthly_cap numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_period_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_period_end timestamptz := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  v_committed_cost numeric;
  v_reserved_cost numeric;
  v_reservation_id uuid;
begin
  if p_team_id is null or p_user_id is null
     or p_reserved_cost is null or p_reserved_cost <= 0
     or p_monthly_cap is null or p_monthly_cap < 0 then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  -- Esta fila es el mutex estable por Equipo. El mismo lock se toma al
  -- finalizar o liberar una reserva para mantener una sola secuencia contable.
  perform 1 from public.teams where id = p_team_id for update;
  if not found then
    return jsonb_build_object('status', 'not_authorized');
  end if;

  -- Solo Propietario/Colaborador pueden consumir el fondo compartido. La Edge
  -- Function ya autorizó, y esta comprobación transaccional evita un bypass.
  perform 1
  from public.team_members
  where team_id = p_team_id
    and user_id = p_user_id
    and role in ('owner', 'editor')
  for key share;
  if not found then
    return jsonb_build_object('status', 'not_authorized');
  end if;

  -- El presupuesto máximo es 30 s para conteo + 120 s para generación, más
  -- los reintentos de finalización. Cinco minutos lo supera con margen y
  -- recupera isolates muertos sin bloquear el mes completo.
  delete from public.ai_spend_reservations
  where team_id = p_team_id
    and created_at < now() - interval '5 minutes';

  -- Las lápidas solo necesitan cubrir reintentos tardíos, no crecer para
  -- siempre. Cada reserva purga como máximo 100 del mismo Equipo y conserva
  -- 90 días para diagnóstico e idempotencia operativa.
  delete from public.ai_spend_reservation_outcomes
  where reservation_id in (
    select reservation_id
    from public.ai_spend_reservation_outcomes
    where team_id = p_team_id
      and completed_at < now() - interval '90 days'
    order by completed_at
    limit 100
  );

  select coalesce(sum(cost), 0)
    into v_committed_cost
  from public.ai_usage
  where team_id = p_team_id
    and created_at >= v_period_start
    and created_at < v_period_end;

  select coalesce(sum(reserved_cost), 0)
    into v_reserved_cost
  from public.ai_spend_reservations
  where team_id = p_team_id
    and period_start = v_period_start;

  if v_committed_cost + v_reserved_cost + p_reserved_cost > p_monthly_cap then
    return jsonb_build_object('status', 'cap_reached');
  end if;

  insert into public.ai_spend_reservations (
    team_id, user_id, model, feature, reserved_cost, period_start
  ) values (
    p_team_id, p_user_id, p_model, p_feature, p_reserved_cost, v_period_start
  )
  returning id into v_reservation_id;

  return jsonb_build_object(
    'status', 'reserved',
    'reservation_id', v_reservation_id,
    'period_start', v_period_start
  );
end;
$$;

-- Convierte una reserva en uso real de manera atómica. created_at conserva el
-- instante de autorización para que una llamada que cruza medianoche/fin de mes
-- se contabilice en el mismo periodo que reservó. El coste real nunca puede ser
-- mayor que el máximo reservado; una discrepancia queda cerrada para revisión.
create or replace function public.finalize_ai_spend_v2(
  p_reservation_id uuid,
  p_user_id uuid,
  p_in_tokens integer,
  p_out_tokens integer,
  p_actual_cost numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_team_id uuid;
  v_reservation public.ai_spend_reservations%rowtype;
begin
  if p_reservation_id is null or p_user_id is null
     or p_in_tokens is null or p_in_tokens < 0
     or p_out_tokens is null or p_out_tokens < 0
     or p_actual_cost is null or p_actual_cost < 0 then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select team_id into v_team_id
  from public.ai_spend_reservations
  where id = p_reservation_id;
  if not found then
    perform 1 from public.ai_spend_reservation_outcomes
    where reservation_id = p_reservation_id
      and user_id = p_user_id
      and outcome = 'finalized';
    if found then return jsonb_build_object('status', 'already_finalized'); end if;
    return jsonb_build_object('status', 'missing');
  end if;

  perform 1 from public.teams where id = v_team_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;

  select * into v_reservation
  from public.ai_spend_reservations
  where id = p_reservation_id
  for update;
  if not found then
    perform 1 from public.ai_spend_reservation_outcomes
    where reservation_id = p_reservation_id
      and user_id = p_user_id
      and outcome = 'finalized';
    if found then return jsonb_build_object('status', 'already_finalized'); end if;
    return jsonb_build_object('status', 'missing');
  end if;
  if v_reservation.user_id <> p_user_id then
    return jsonb_build_object('status', 'missing');
  end if;
  if p_actual_cost > v_reservation.reserved_cost then
    return jsonb_build_object('status', 'cost_exceeded');
  end if;

  insert into public.ai_usage (
    team_id, user_id, model, in_tokens, out_tokens, cost, feature, created_at
  ) values (
    v_reservation.team_id,
    v_reservation.user_id,
    v_reservation.model,
    p_in_tokens,
    p_out_tokens,
    p_actual_cost,
    v_reservation.feature,
    v_reservation.created_at
  );

  insert into public.ai_spend_reservation_outcomes (
    reservation_id, team_id, user_id, outcome
  ) values (
    v_reservation.id, v_reservation.team_id, v_reservation.user_id, 'finalized'
  );
  delete from public.ai_spend_reservations where id = p_reservation_id;
  return jsonb_build_object('status', 'finalized');
end;
$$;

-- Libera una reserva cuando el proveedor rechaza la llamada antes de producir
-- un resultado cobrable. Un fallo deja la reserva intacta (fail-closed).
create or replace function public.release_ai_spend_v2(
  p_reservation_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_team_id uuid;
  v_reservation public.ai_spend_reservations%rowtype;
begin
  if p_reservation_id is null or p_user_id is null then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  select team_id into v_team_id
  from public.ai_spend_reservations
  where id = p_reservation_id;
  if not found then
    perform 1 from public.ai_spend_reservation_outcomes
    where reservation_id = p_reservation_id
      and user_id = p_user_id
      and outcome = 'released';
    if found then return jsonb_build_object('status', 'already_released'); end if;
    return jsonb_build_object('status', 'missing');
  end if;

  perform 1 from public.teams where id = v_team_id for update;
  if not found then return jsonb_build_object('status', 'missing'); end if;

  select * into v_reservation
  from public.ai_spend_reservations
  where id = p_reservation_id
  for update;
  if not found then
    perform 1 from public.ai_spend_reservation_outcomes
    where reservation_id = p_reservation_id
      and user_id = p_user_id
      and outcome = 'released';
    if found then return jsonb_build_object('status', 'already_released'); end if;
    return jsonb_build_object('status', 'missing');
  end if;
  if v_reservation.user_id <> p_user_id then
    return jsonb_build_object('status', 'missing');
  end if;

  insert into public.ai_spend_reservation_outcomes (
    reservation_id, team_id, user_id, outcome
  ) values (
    v_reservation.id, v_reservation.team_id, v_reservation.user_id, 'released'
  );

  delete from public.ai_spend_reservations where id = p_reservation_id;
  return jsonb_build_object('status', 'released');
end;
$$;

-- Las firmas v1 y la RPC de lectura inicial no tienen consumidores. Se eliminan
-- también al reaplicar este SQL para mantener la superficie privilegiada mínima.
drop function if exists public.finalize_ai_spend(uuid, uuid, integer, integer, numeric);
drop function if exists public.release_ai_spend(uuid, uuid);
drop function if exists public.ai_month_cost(uuid);

revoke all on function public.reserve_ai_spend(uuid, uuid, text, text, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.finalize_ai_spend_v2(uuid, uuid, integer, integer, numeric)
  from public, anon, authenticated;
revoke all on function public.release_ai_spend_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_spend(uuid, uuid, text, text, numeric, numeric)
  to service_role;
grant execute on function public.finalize_ai_spend_v2(uuid, uuid, integer, integer, numeric)
  to service_role;
grant execute on function public.release_ai_spend_v2(uuid, uuid)
  to service_role;
