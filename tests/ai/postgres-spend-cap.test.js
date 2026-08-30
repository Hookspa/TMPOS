// Prueba de integración contra PostgreSQL real y desechable. No usa Supabase
// remoto: crea un contenedor local, aplica fixtures mínimos y lo elimina al final.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase', 'sql', 'ai_spend_cap.sql'), 'utf8');
const IMAGE = process.env.TEMPO_POSTGRES_IMAGE || 'public.ecr.aws/supabase/postgres:17.6.1.143';
const REQUIRE_POSTGRES = process.env.TEMPO_REQUIRE_POSTGRES === '1';
const TEST_CONTAINER_LABEL = 'tempo.ai-spend-cap-test=true';
const TEAM_A = '10000000-0000-4000-8000-000000000001';
const TEAM_B = '10000000-0000-4000-8000-000000000002';
const OWNER = '20000000-0000-4000-8000-000000000001';
const EDITOR = '20000000-0000-4000-8000-000000000002';
const LECTOR = '20000000-0000-4000-8000-000000000003';
const REVIEWER = '20000000-0000-4000-8000-000000000004';

function docker(args, options = {}) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
    ...options,
  });
}

function dockerError(error) {
  return String(error?.stderr || error?.message || error).trim().replaceAll(/\s+/g, ' ');
}

function removeOrphanedTestContainers() {
  const ids = docker(['ps', '--all', '--quiet', '--filter', 'name=^/tempo-ai-cap-'])
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length) docker(['rm', '--force', ...ids]);
}

function waitForText(getText, marker, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (getText().includes(marker)) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error(`No apareció ${marker}`));
      setTimeout(poll, 20);
    };
    poll();
  });
}

test('ai_spend_cap.sql funciona en PostgreSQL real', { timeout: 180_000 }, async (t) => {
  try {
    docker(['version', '--format', '{{.Server.Version}}'], { timeout: 5_000 });
  } catch (error) {
    const reason = `Docker/PostgreSQL no disponible: ${dockerError(error)}`;
    if (REQUIRE_POSTGRES) throw new Error(reason);
    t.skip(`${reason}. Usa TEMPO_REQUIRE_POSTGRES=1 para exigir esta integración.`);
    return;
  }

  // Solo elimina contenedores desechables con el prefijo exclusivo de esta
  // prueba. Esto recupera intentos interrumpidos sin tocar otros servicios.
  removeOrphanedTestContainers();
  const container = `tempo-ai-cap-${process.pid}-${Date.now()}`;
  try {
    docker(['image', 'inspect', IMAGE]);
  } catch {
    docker(['pull', IMAGE], { stdio: 'pipe' });
  }

  docker([
    'run', '--detach', '--rm', '--name', container,
    '--label', TEST_CONTAINER_LABEL,
    '--env', 'POSTGRES_PASSWORD=tempo_local_test',
    '--env', 'POSTGRES_DB=tempo_ai_test',
    IMAGE,
  ]);
  t.after(() => {
    try { docker(['rm', '--force', container]); } catch { /* ya se eliminó */ }
  });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      // pg_isready también responde durante el servidor temporal que usa el
      // entrypoint para instalar extensiones. Espera a que PID 1 ya sea el
      // PostgreSQL definitivo; de otro modo el fixture compite con pg_graphql.
      docker([
        'exec', container, 'sh', '-c',
        'tr "\\000" " " < /proc/1/cmdline | grep -q "/postgres -D "',
      ]);
      docker(['exec', container, 'pg_isready', '-U', 'supabase_admin', '-d', 'tempo_ai_test']);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert.ok(ready, `PostgreSQL no inició:\n${docker(['logs', container])}`);

  function psql(sql, { role = 'supabase_admin' } = {}) {
    return docker([
      'exec', '--interactive', container,
      'psql', '-X', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
      '--set', 'ON_ERROR_STOP=1', '-U', role, '-d', 'tempo_ai_test',
    ], { input: sql }).trim();
  }

  function startPsql(sql) {
    const child = spawn('docker', [
      'exec', '--interactive', container,
      'psql', '-X', '--no-psqlrc', '--quiet', '--tuples-only', '--no-align',
      '--set', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'tempo_ai_test',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.end(sql);
    const done = new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => code === 0
        ? resolve(stdout.trim())
        : reject(new Error(`psql terminó ${code}: ${stderr}\n${stdout}`)));
    });
    return { child, done, waitFor: (marker) => waitForText(() => stdout, marker) };
  }

  psql(`
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.teams (id uuid primary key, name text not null);
    create table public.team_members (
      team_id uuid not null references public.teams(id) on delete cascade,
      user_id uuid not null,
      role text not null,
      primary key (team_id, user_id)
    );
    create table public.ai_usage (
      id bigint generated always as identity primary key,
      team_id uuid references public.teams(id) on delete set null,
      user_id uuid,
      model text,
      in_tokens integer not null default 0,
      out_tokens integer not null default 0,
      cost numeric not null default 0,
      feature text,
      created_at timestamptz not null default now()
    );
    insert into public.teams (id, name) values
      ('${TEAM_A}', 'Equipo A'), ('${TEAM_B}', 'Equipo B');
    insert into public.team_members (team_id, user_id, role) values
      ('${TEAM_A}', '${OWNER}', 'owner'),
      ('${TEAM_A}', '${EDITOR}', 'editor'),
      ('${TEAM_A}', '${LECTOR}', 'lector'),
      ('${TEAM_A}', '${REVIEWER}', 'reviewer'),
      ('${TEAM_B}', '${OWNER}', 'owner');
  `);

  // La segunda aplicación convierte la idempotencia declarada en una prueba real.
  psql(MIGRATION);
  psql(MIGRATION);

  function resetUsage() {
    psql(`truncate public.ai_spend_reservation_outcomes,
      public.ai_spend_reservations, public.ai_usage restart identity;`);
  }

  function reserve(teamId, userId, cost, cap, feature = 'test') {
    return psql(`select public.reserve_ai_spend(
      '${teamId}', '${userId}', 'claude-haiku-4-5', '${feature}', ${cost}, ${cap}
    ) ->> 'status';`);
  }

  await t.test('aplicación idempotente y objetos esperados', () => {
    assert.equal(psql("select to_regclass('public.ai_spend_reservations') is not null;"), 't');
    assert.equal(psql("select to_regprocedure('public.reserve_ai_spend(uuid,uuid,text,text,numeric,numeric)') is not null;"), 't');
    assert.equal(psql("select to_regprocedure('public.finalize_ai_spend(uuid,uuid,integer,integer,numeric)') is null;"), 't');
    assert.equal(psql("select to_regprocedure('public.release_ai_spend(uuid,uuid)') is null;"), 't');
    assert.equal(psql("select to_regprocedure('public.finalize_ai_spend_v2(uuid,uuid,integer,integer,numeric)') is not null;"), 't');
    assert.equal(psql("select to_regprocedure('public.release_ai_spend_v2(uuid,uuid)') is not null;"), 't');
  });

  await t.test('exclusión concurrente por Equipo impide sobrerreservar', async () => {
    resetUsage();
    const first = startPsql(`
      begin;
      select 'FIRST:' || (public.reserve_ai_spend(
        '${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'concurrente', 0.75, 1
      ) ->> 'status');
      select pg_sleep(1.2);
      commit;
    `);
    await first.waitFor('FIRST:reserved');
    const started = Date.now();
    const second = reserve(TEAM_A, EDITOR, 0.75, 1, 'concurrente');
    const elapsed = Date.now() - started;
    assert.equal(second, 'cap_reached');
    assert.ok(elapsed >= 700, `la segunda reserva no esperó el lock (${elapsed} ms)`);
    assert.match(await first.done, /FIRST:reserved/);
    assert.equal(psql('select count(*) from public.ai_spend_reservations;'), '1');
  });

  await t.test('Equipos distintos no comparten lock ni saldo', async () => {
    resetUsage();
    const lockA = startPsql(`
      begin;
      select 1 from public.teams where id = '${TEAM_A}' for update;
      select 'TEAM_A_LOCKED';
      select pg_sleep(2);
      commit;
    `);
    await lockA.waitFor('TEAM_A_LOCKED');
    const started = Date.now();
    assert.equal(reserve(TEAM_B, OWNER, 0.4, 1), 'reserved');
    assert.ok(Date.now() - started < 1_500, 'Equipo B quedó bloqueado por Equipo A');
    await lockA.done;
  });

  await t.test('deniega el tope y aísla el coste por Equipo', () => {
    resetUsage();
    psql(`insert into public.ai_usage (team_id, user_id, model, cost)
      values ('${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 0.90);`);
    assert.equal(reserve(TEAM_A, OWNER, 0.11, 1), 'cap_reached');
    assert.equal(reserve(TEAM_B, OWNER, 0.11, 1), 'reserved');
  });

  await t.test('roles no consumidores quedan denegados', () => {
    resetUsage();
    assert.equal(reserve(TEAM_A, LECTOR, 0.1, 1), 'not_authorized');
    assert.equal(reserve(TEAM_A, REVIEWER, 0.1, 1), 'not_authorized');
    assert.equal(reserve(TEAM_A, OWNER, 0.1, 1), 'reserved');
    assert.equal(reserve(TEAM_A, EDITOR, 0.1, 1), 'reserved');
  });

  await t.test('el mes UTC anterior no consume el actual y finalize conserva el periodo reservado', () => {
    resetUsage();
    psql(`insert into public.ai_usage (team_id, user_id, model, cost, created_at) values
      ('${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 99, date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' - interval '1 second'),
      ('${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 0.20, now());`);
    assert.equal(reserve(TEAM_A, OWNER, 0.70, 1), 'reserved');
    resetUsage();
    const reservationId = psql(`select public.reserve_ai_spend(
      '${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'cruce_mes', 0.40, 1
    ) ->> 'reservation_id';`);
    psql(`update public.ai_spend_reservations
      set created_at = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' - interval '1 second',
          period_start = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' - interval '1 month'
      where id = '${reservationId}';`);
    assert.equal(psql(`select public.finalize_ai_spend_v2(
      '${reservationId}', '${OWNER}', 10, 5, 0.30
    ) ->> 'status';`), 'finalized');
    assert.equal(psql(`select created_at < date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
      from public.ai_usage where feature = 'cruce_mes';`), 't');
  });

  await t.test('TTL purga reservas huérfanas pero conserva llamadas vivas', () => {
    resetUsage();
    psql(`insert into public.ai_spend_reservations
      (team_id, user_id, model, feature, reserved_cost, period_start, created_at) values
      ('${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'stale', 0.1,
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC', now() - interval '6 minutes'),
      ('${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'live', 0.1,
        date_trunc('month', now() at time zone 'UTC') at time zone 'UTC', now() - interval '4 minutes');`);
    assert.equal(reserve(TEAM_A, OWNER, 0.1, 10, 'trigger_ttl'), 'reserved');
    assert.equal(psql("select count(*) from public.ai_spend_reservations where feature = 'stale';"), '0');
    assert.equal(psql("select count(*) from public.ai_spend_reservations where feature = 'live';"), '1');
  });

  await t.test('finalize y release repetidos son idempotentes', () => {
    resetUsage();
    const finalizedId = psql(`select public.reserve_ai_spend(
      '${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'finalize', 0.5, 1
    ) ->> 'reservation_id';`);
    const finalizeSql = `select public.finalize_ai_spend_v2(
      '${finalizedId}', '${OWNER}', 10, 5, 0.3
    ) ->> 'status';`;
    assert.equal(psql(finalizeSql), 'finalized');
    assert.equal(psql(finalizeSql), 'already_finalized');
    assert.equal(psql("select count(*) from public.ai_usage where feature = 'finalize';"), '1');

    const releasedId = psql(`select public.reserve_ai_spend(
      '${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'release', 0.5, 1
    ) ->> 'reservation_id';`);
    const releaseSql = `select public.release_ai_spend_v2('${releasedId}', '${OWNER}') ->> 'status';`;
    assert.equal(psql(releaseSql), 'released');
    assert.equal(psql(releaseSql), 'already_released');
    assert.equal(psql("select count(*) from public.ai_usage where feature = 'release';"), '0');
  });

  await t.test('finalize y release aplican guardas simétricas y no revelan reservas ajenas', () => {
    resetUsage();
    assert.equal(psql(`select public.finalize_ai_spend_v2(
      null, '${OWNER}', 1, 1, 0.01
    ) ->> 'status';`), 'invalid_request');
    assert.equal(psql(`select public.release_ai_spend_v2(
      null, '${OWNER}'
    ) ->> 'status';`), 'invalid_request');
    const id = psql(`select public.reserve_ai_spend(
      '${TEAM_A}', '${OWNER}', 'claude-haiku-4-5', 'guard', 0.1, 1
    ) ->> 'reservation_id';`);
    assert.equal(psql(`select public.finalize_ai_spend_v2(
      '${id}', null, 1, 1, 0.01
    ) ->> 'status';`), 'invalid_request');
    assert.equal(psql(`select public.finalize_ai_spend_v2(
      '${id}', '${OWNER}', -1, 1, 0.01
    ) ->> 'status';`), 'invalid_request');
    assert.equal(psql(`select public.finalize_ai_spend_v2(
      '${id}', '${EDITOR}', 1, 1, 0.01
    ) ->> 'status';`), 'missing');
    assert.equal(psql(`select public.release_ai_spend_v2('${id}', null) ->> 'status';`), 'invalid_request');
    assert.equal(psql(`select public.release_ai_spend_v2('${id}', '${EDITOR}') ->> 'status';`), 'missing');
    assert.equal(psql(`select count(*) from public.ai_spend_reservations where id = '${id}';`), '1');
  });

  await t.test('purga de lápidas queda acotada por Equipo, antigüedad y lote', () => {
    resetUsage();
    psql(`
      insert into public.ai_spend_reservation_outcomes
        (reservation_id, team_id, user_id, outcome, completed_at)
      select gen_random_uuid(), '${TEAM_A}', '${OWNER}', 'released', now() - interval '91 days'
      from generate_series(1, 105);
      insert into public.ai_spend_reservation_outcomes
        (reservation_id, team_id, user_id, outcome, completed_at) values
        (gen_random_uuid(), '${TEAM_A}', '${OWNER}', 'released', now()),
        (gen_random_uuid(), '${TEAM_B}', '${OWNER}', 'released', now() - interval '91 days');
    `);
    assert.equal(reserve(TEAM_A, OWNER, 0.1, 1, 'purga'), 'reserved');
    assert.equal(psql(`select count(*) from public.ai_spend_reservation_outcomes
      where team_id = '${TEAM_A}' and completed_at < now() - interval '90 days';`), '5');
    assert.equal(psql(`select count(*) from public.ai_spend_reservation_outcomes
      where team_id = '${TEAM_A}' and completed_at >= now() - interval '90 days';`), '1');
    assert.equal(psql(`select count(*) from public.ai_spend_reservation_outcomes
      where team_id = '${TEAM_B}';`), '1');
  });

  await t.test('tablas y RPC quedan revocadas para clientes', () => {
    for (const role of ['anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        assert.equal(psql(`select has_table_privilege('${role}',
          'public.ai_spend_reservations', '${privilege}');`), 'f');
        assert.equal(psql(`select has_table_privilege('${role}',
          'public.ai_spend_reservation_outcomes', '${privilege}');`), 'f');
      }
      assert.equal(psql(`select has_function_privilege('${role}',
        'public.reserve_ai_spend(uuid,uuid,text,text,numeric,numeric)', 'EXECUTE');`), 'f');
      assert.equal(psql(`select has_function_privilege('${role}',
        'public.finalize_ai_spend_v2(uuid,uuid,integer,integer,numeric)', 'EXECUTE');`), 'f');
      assert.equal(psql(`select has_function_privilege('${role}',
        'public.release_ai_spend_v2(uuid,uuid)', 'EXECUTE');`), 'f');
    }
    assert.equal(psql(`select has_function_privilege('service_role',
      'public.reserve_ai_spend(uuid,uuid,text,text,numeric,numeric)', 'EXECUTE');`), 't');
    assert.equal(psql("select to_regprocedure('public.ai_month_cost(uuid)') is null;"), 't');
  });
});
