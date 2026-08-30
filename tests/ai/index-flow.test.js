// Flujo integrado de la Edge Function con red y Supabase mockeados. Se ejecuta
// el handler real de index.ts para fijar el orden de seguridad completo:
// autenticación → membresía → reserva atómica → Anthropic → finalización.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'claude', 'index.ts'), 'utf8');
const TRANSCRIBE = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'transcribe', 'index.ts'), 'utf8');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'releases.js'), 'utf8');
const REPORT = fs.readFileSync(path.join(ROOT, 'report.html'), 'utf8');
const SPEND_CAP_SQL = fs.readFileSync(path.join(ROOT, 'supabase', 'sql', 'ai_spend_cap.sql'), 'utf8');
const TEAM = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const OTHER_TEAM = '8a9b0c1d-2e3f-4a5b-9c6d-7e8f90123456';
const RESERVATION = 'f065dd77-3190-4f8a-89c0-3c7335255793';

function stripTypeScript(source) {
  return source
    .replace(/^import .*;\s*$/gm, '')
    .replace(/Deno\.env\.get\(([^)]+)\)!/g, 'Deno.env.get($1)')
    .replace(/\blet (raw|insertError): unknown\b/g, 'let $1')
    .replace(/\blet (r|countResponse): Response\b/g, 'let $1')
    .replace(/\blet (data|countData): any\b/g, 'let $1')
    .replace(/\(b: any\)/g, '(b)')
    .replace(/function j\(obj: unknown, status: number\)/, 'function j(obj, status)');
}

function validBody(overrides = {}) {
  return { prompt: 'hola', model: 'claude-haiku-4-5', max_tokens: 200, feature: 'ideas', ...overrides };
}

async function loadHandler(options = {}) {
  const events = [];
  const memberships = options.memberships === undefined ? [{ team_id: TEAM, role: 'editor' }] : options.memberships;
  const memberResult = options.memberResult || { data: { user_id: 'user-1', role: 'editor' }, error: null };
  const reserveResult = options.reserveResult || {
    data: { status: 'reserved', reservation_id: RESERVATION }, error: null,
  };
  const finalizes = [...(options.finalizes || [{ data: { status: 'finalized' }, error: null }])];
  const releases = [...(options.releases || [{ data: { status: 'released' }, error: null }])];
  let allowedMembershipRoles = null;

  const membershipQuery = {
    select() { return this; },
    eq() { return this; },
    in(column, values) {
      assert.equal(column, 'role');
      allowedMembershipRoles = new Set(values);
      return this;
    },
    limit() { return this; },
    maybeSingle() {
      events.push('membresía');
      return Promise.resolve(memberResult);
    },
    then(resolve, reject) {
      events.push('membresía');
      const data = allowedMembershipRoles
        ? memberships.filter((membership) => allowedMembershipRoles.has(membership.role))
        : memberships;
      return Promise.resolve({ data, error: options.membershipsError || null }).then(resolve, reject);
    },
  };
  const supa = {
    auth: {
      async getUser() {
        events.push('auth');
        return { data: { user: options.user === null ? null : { id: 'user-1' } } };
      },
    },
    from(table) {
      assert.equal(table, 'team_members');
      return membershipQuery;
    },
    async rpc(name, args) {
      if (name === 'reserve_ai_spend') {
        events.push('reserva');
        assert.equal(args.p_team_id, TEAM);
        assert.equal(args.p_user_id, 'user-1');
        options.onReserve?.(args);
        if (reserveResult.throw) throw reserveResult.throw;
        return reserveResult;
      }
      if (name === 'finalize_ai_spend_v2') {
        events.push('finaliza');
        assert.equal(args.p_reservation_id, RESERVATION);
        assert.equal(args.p_user_id, 'user-1');
        options.onFinalize?.(args);
        const result = finalizes.length ? finalizes.shift() : { data: { status: 'finalized' }, error: null };
        if (result.throw) throw result.throw;
        return result;
      }
      assert.equal(name, 'release_ai_spend_v2');
      events.push('libera');
      assert.equal(args.p_reservation_id, RESERVATION);
      assert.equal(args.p_user_id, 'user-1');
      const result = releases.length ? releases.shift() : { data: { status: 'released' }, error: null };
      if (result.throw) throw result.throw;
      return result;
    },
  };
  let handler;
  const source = stripTypeScript(INDEX);
  const context = {
    __deps: {
      createClient: () => supa,
      validateBody: (body) => ({ ok: true, value: {
        prompt: body.prompt,
        model: body.model,
        maxTokens: body.max_tokens,
        teamId: body.team_id || null,
        feature: body.feature || null,
      } }),
      costOf: options.costOf || ((_model, inTok, outTok) => inTok / 1e6 + outTok * 5 / 1e6),
    },
    Deno: {
      env: { get: (name) => name === 'AI_MONTHLY_TEAM_CAP_USD'
        ? options.monthlyCap === undefined ? undefined : String(options.monthlyCap)
        : 'test-secret' },
      serve(fn) { handler = fn; },
    },
    fetch: async (url, init) => {
      if (url.endsWith('/count_tokens')) {
        events.push('cuenta_tokens');
        options.onCountFetch?.(url, init);
        if (options.countFetchThrow) throw options.countFetchThrow;
        return {
          ok: options.countFetchOk === undefined ? true : options.countFetchOk,
          async json() {
            if (options.countJsonThrow) throw options.countJsonThrow;
            return options.countData || { input_tokens: 10 };
          },
        };
      }
      events.push('fetch');
      options.onFetch?.(url, init);
      if (options.fetchThrow) throw options.fetchThrow;
      return {
        ok: options.fetchOk === undefined ? true : options.fetchOk,
        status: options.fetchStatus || 200,
        async json() {
          if (options.fetchJsonThrow) throw options.fetchJsonThrow;
          if (Object.hasOwn(options, 'providerData')) return options.providerData;
          if (options.providerError) return { error: { message: options.providerError } };
          return {
            content: [{ text: 'respuesta' }],
            usage: options.providerUsage || { input_tokens: 10, output_tokens: 5 },
          };
        },
      };
    },
    Response,
    Error,
    AbortSignal,
    TextEncoder,
    console: { error: (...args) => options.onConsoleError?.(...args) },
    setTimeout: (fn) => { fn(); return 0; },
  };
  vm.runInNewContext(
    `const { createClient, costOf, validateBody } = __deps;\n${source}`,
    context,
    { filename: 'supabase/functions/claude/index.ts' }
  );
  assert.equal(typeof handler, 'function');
  return { handler, events };
}

async function invoke(handler, body) {
  const response = await handler({
    method: 'POST',
    headers: { get: () => 'Bearer token' },
    json: async () => body,
  });
  return { status: response.status, data: await response.json() };
}

test('reserva antes de Anthropic, finaliza después y fija el orden completo', async () => {
  let reserved;
  let finalized;
  let fetchInit;
  const { handler, events } = await loadHandler({
    onReserve: (args) => { reserved = args; },
    onFinalize: (args) => { finalized = args; },
    onFetch: (_url, init) => { fetchInit = init; },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 200);
  assert.equal(result.data.text, 'respuesta');
  assert.equal(reserved.p_model, 'claude-haiku-4-5');
  assert.equal(reserved.p_feature, 'ideas');
  assert.equal(reserved.p_monthly_cap, 25);
  assert.ok(reserved.p_reserved_cost > finalized.p_actual_cost);
  assert.equal(finalized.p_in_tokens, 10);
  assert.equal(finalized.p_out_tokens, 5);
  assert.ok(fetchInit.signal instanceof AbortSignal);
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch', 'finaliza']);
});

test('sin team_id deriva el único Equipo y lo usa en la reserva server-side', async () => {
  let reserved;
  const { handler, events } = await loadHandler({ onReserve: (args) => { reserved = args; } });
  const result = await invoke(handler, validBody());
  assert.equal(result.status, 200);
  assert.equal(reserved.p_team_id, TEAM);
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch', 'finaliza']);
});

test('una reserva denegada por el tope devuelve 429 sin llamar a Anthropic', async (t) => {
  const cases = [
    ['tope por defecto', undefined, 25],
    ['tope configurado por entorno', 3, 3],
    ['kill switch', 0, 0],
  ];
  for (const [name, monthlyCap, expectedCap] of cases) {
    await t.test(name, async () => {
      let reserveArgs;
      const { handler, events } = await loadHandler({
        reserveResult: { data: { status: 'cap_reached' }, error: null },
        monthlyCap,
        onReserve: (args) => { reserveArgs = args; },
      });
      const result = await invoke(handler, validBody({ team_id: TEAM }));
      assert.equal(result.status, 429);
      assert.match(result.data.error, /equipo alcanzó su tope mensual de IA/i);
      assert.match(result.data.error, /se renueva el 1 del mes siguiente/i);
      assert.equal(reserveArgs.p_monthly_cap, expectedCap);
      assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva']);
    });
  }
});

test('un error o respuesta inválida al reservar falla cerrado con 503', async (t) => {
  const cases = [
    ['error de base', { data: null, error: { message: 'db caída' } }],
    ['status desconocido', { data: { status: 'tal_vez' }, error: null }],
    ['id de reserva ausente', { data: { status: 'reserved' }, error: null }],
  ];
  for (const [name, reserveResult] of cases) await t.test(name, async () => {
    const { handler, events } = await loadHandler({ reserveResult });
    const result = await invoke(handler, validBody({ team_id: TEAM }));
    assert.equal(result.status, 503);
    assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva']);
  });
});

test('una configuración inválida del tope falla cerrada antes de reservar', async (t) => {
  for (const monthlyCap of ['', -1, 'no-numérico', '0x10', '1e2']) await t.test(JSON.stringify(monthlyCap), async () => {
    const { handler, events } = await loadHandler({ monthlyCap });
    const result = await invoke(handler, validBody({ team_id: TEAM }));
    assert.equal(result.status, 503);
    assert.deepEqual(events, ['auth', 'membresía']);
  });
});

test('sin Usuario autenticado no consulta membresía ni reserva gasto', async () => {
  const { handler, events } = await loadHandler({ user: null });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 401);
  assert.deepEqual(events, ['auth']);
});

test('la reserva vuelve a autorizar y niega si la membresía cambió', async () => {
  const { handler, events } = await loadHandler({
    reserveResult: { data: { status: 'not_authorized' }, error: null },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 403);
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva']);
});

test('sin team_id rechaza cero, varios o error de consulta sin llamar Anthropic', async (t) => {
  const cases = [
    ['ninguno', [], null, 403],
    ['varios', [{ team_id: TEAM, role: 'editor' }, { team_id: OTHER_TEAM, role: 'owner' }], null, 400],
    ['membresía corrupta', [{ team_id: null, role: 'editor' }], null, 503],
    ['error', [], { message: 'db caída' }, 503],
  ];
  for (const [name, memberships, membershipsError, status] of cases) {
    await t.test(name, async () => {
      const { handler, events } = await loadHandler({ memberships, membershipsError });
      const result = await invoke(handler, validBody());
      assert.equal(result.status, status);
      if (name === 'varios') assert.match(result.data.error, /team_id explícitamente/);
      assert.deepEqual(events, ['auth', 'membresía']);
    });
  }
});

test('team_id explícito ajeno devuelve 403 y corta el flujo', async () => {
  const { handler, events } = await loadHandler({ memberResult: { data: null, error: null } });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 403);
  assert.deepEqual(events, ['auth', 'membresía']);
});

test('Observador/lector no puede consumir el fondo de IA del Equipo', async () => {
  const { handler, events } = await loadHandler({
    memberResult: { data: { user_id: 'user-1', role: 'lector' }, error: null },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 403);
  assert.match(result.data.error, /permiso para usar IA/i);
  assert.deepEqual(events, ['auth', 'membresía']);
});

test('sin team_id tampoco deriva un Equipo donde el Usuario solo observa', async () => {
  const { handler, events } = await loadHandler({ memberships: [{ team_id: TEAM, role: 'lector' }] });
  const result = await invoke(handler, validBody());
  assert.equal(result.status, 403);
  assert.deepEqual(events, ['auth', 'membresía']);
});

test('un error verificando team_id explícito devuelve 503 y corta el flujo', async () => {
  const { handler, events } = await loadHandler({ memberResult: { data: null, error: { message: 'db caída' } } });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 503);
  assert.deepEqual(events, ['auth', 'membresía']);
});

test('un error del proveedor libera la reserva y no finaliza gasto', async (t) => {
  const cases = [
    ['error estructurado', { providerError: 'model claude-haiku-4-5 rechazado' }],
    ['HTTP no exitoso', { fetchOk: false, fetchStatus: 502 }],
    ['fetch lanza', { fetchThrow: new Error('model claude-haiku-4-5 sin red') }],
    ['JSON inválido', { fetchJsonThrow: new Error('claude-haiku-4-5 devolvió JSON roto') }],
    ['JSON null', { providerData: null }],
  ];
  for (const [name, options] of cases) await t.test(name, async () => {
    const { handler, events } = await loadHandler(options);
    const result = await invoke(handler, validBody({ team_id: TEAM }));
    assert.equal(result.status, 502);
    assert.equal(result.data.error, 'El proveedor de IA no pudo completar la solicitud.');
    assert.doesNotMatch(JSON.stringify(result.data), /claude|haiku|anthropic/i);
    assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch', 'libera']);
  });
});

test('si no puede liberar tras rechazo del proveedor, registra el fallo y conserva la reserva', async () => {
  let loggedError = '';
  const { handler, events } = await loadHandler({
    providerError: 'model claude-haiku-4-5 rechazado',
    releases: [{ data: { status: 'missing' }, error: { message: 'db caída' } }],
    onConsoleError: (msg) => { loggedError = msg; },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 502);
  assert.equal(result.data.error, 'El proveedor de IA no pudo completar la solicitud.');
  assert.match(loggedError, /ai_spend_release_failed/);
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch', 'libera']);
});

test('la finalización atómica reintenta y puede recuperarse', async () => {
  const { handler, events } = await loadHandler({
    finalizes: [{ data: null, error: { message: 'temporal' } }, { data: { status: 'already_finalized' }, error: null }],
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.data.logged, undefined);
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch', 'finaliza', 'finaliza']);
});

test('si la finalización falla conserva el texto y la reserva fail-closed', async () => {
  let loggedError = '';
  const { handler, events } = await loadHandler({
    finalizes: [{ data: { status: 'missing' }, error: { message: 'uno' } }, { throw: new Error('dos') }],
    onConsoleError: (msg) => { loggedError = msg; },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.data.text, 'respuesta');
  assert.equal(result.data.logged, false);
  assert.match(loggedError, /ai_usage_finalize_failed/);
  assert.match(loggedError, new RegExp(RESERVATION));
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch', 'finaliza', 'finaliza']);
});

test('uso inválido del proveedor no elimina la reserva ni inventa coste', async () => {
  let loggedError = '';
  const { handler, events } = await loadHandler({
    providerUsage: { input_tokens: -1, output_tokens: 'cinco' },
    onConsoleError: (msg) => { loggedError = msg; },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 200);
  assert.equal(result.data.logged, false);
  assert.match(loggedError, /uso o coste del proveedor inválido/);
  assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens', 'reserva', 'fetch']);
});

test('la reserva usa el conteo server-side con margen y todos los tokens de salida', async () => {
  const prompt = 'un prompt largo que no debe reservar un token por byte';
  let reserved;
  const { handler } = await loadHandler({
    costOf: (_model, inTok, outTok) => inTok + outTok,
    countData: { input_tokens: 17 },
    onReserve: (args) => { reserved = args; },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM, prompt, max_tokens: 200 }));
  assert.equal(result.status, 200);
  assert.equal(reserved.p_reserved_cost, 17 + 1024 + 200);
});

test('si el conteo server-side falla no reserva ni genera y responde 503', async (t) => {
  const cases = [
    ['HTTP no exitoso', { countFetchOk: false }],
    ['respuesta inválida', { countData: { input_tokens: 'muchos' } }],
    ['red caída', { countFetchThrow: new Error('red caída') }],
    ['JSON inválido', { countJsonThrow: new Error('json roto') }],
  ];
  for (const [name, options] of cases) await t.test(name, async () => {
    const { handler, events } = await loadHandler(options);
    const result = await invoke(handler, validBody({ team_id: TEAM }));
    assert.equal(result.status, 503);
    assert.match(result.data.error, /verificar el uso mensual/);
    assert.deepEqual(events, ['auth', 'membresía', 'cuenta_tokens']);
  });
});

test('el cliente muestra el cuerpo JSON de FunctionsHttpError para un 429', async () => {
  const start = CLIENT.indexOf('async function edgeFunctionErrorMessage(');
  const end = CLIENT.indexOf('function parseJSONArray(', start);
  assert.ok(start >= 0 && end > start, 'no se pudo aislar el contrato del cliente IA');
  const capMessage = 'Este equipo alcanzó su tope mensual de IA. Se renueva el 1 del mes siguiente.';
  const invokeError = {
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ error: capMessage }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }),
  };
  const context = {
    aiSettings: () => ({ model: 'claude-haiku-4-5', maxTokens: 200 }),
    cloudEnabled: () => true,
    authed: () => true,
    getSb: async () => ({ functions: { invoke: async () => ({ data: null, error: invokeError }) } }),
    _teamId: TEAM,
    Error,
    Response,
  };
  await assert.rejects(
    vm.runInNewContext(`${CLIENT.slice(start, end)}\ncallClaude('hola', 200, 'ideas')`, context),
    error => error.message === capMessage
  );
});

test('el cliente conserva el error genérico si FunctionsHttpError no trae JSON legible', async () => {
  const start = CLIENT.indexOf('async function edgeFunctionErrorMessage(');
  const end = CLIENT.indexOf('function parseJSONArray(', start);
  const fallback = 'Edge Function returned a non-2xx status code';
  const context = {
    aiSettings: () => ({ model: 'claude-haiku-4-5', maxTokens: 200 }),
    cloudEnabled: () => true,
    authed: () => true,
    getSb: async () => ({ functions: { invoke: async () => ({
      data: null,
      error: { message: fallback, context: new Response('no-json', { status: 503 }) },
    }) } }),
    _teamId: TEAM,
    Error,
    Response,
  };
  await assert.rejects(
    vm.runInNewContext(`${CLIENT.slice(start, end)}\ncallClaude('hola', 200, 'ideas')`, context),
    error => error.message === fallback
  );
});

test('el reporte también muestra el cuerpo JSON de FunctionsHttpError para un 429', async () => {
  const start = REPORT.indexOf('async function edgeFunctionReportErrorMessage(');
  const end = REPORT.indexOf('async function callAI(', start);
  assert.ok(start >= 0 && end > start, 'no se pudo aislar el manejo de errores IA del reporte');
  const capMessage = 'Este equipo alcanzó su tope mensual de IA. Se renueva el 1 del mes siguiente.';
  const result = await vm.runInNewContext(
    `${REPORT.slice(start, end)}\nedgeFunctionReportErrorMessage({
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: ${JSON.stringify(capMessage)} }), { status: 429 }),
    })`,
    { Response }
  );
  assert.equal(result, capMessage);
});

test('transcribe queda retirada con 410 y sin acceso privilegiado ni proveedor', async () => {
  assert.doesNotMatch(TRANSCRIBE, /SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|createClient|\.from\(["']ai_usage|fetch\s*\(/);
  let handler;
  vm.runInNewContext(TRANSCRIBE, {
    Deno: { serve(fn) { handler = fn; } },
    Response,
    JSON,
  });
  const response = await handler({ method: 'POST', headers: { get: () => null } });
  assert.equal(response.status, 410);
  assert.match((await response.json()).error, /no está disponible/i);
});

test('el SQL serializa por Equipo y suma coste confirmado más reservas', () => {
  const reserveStart = SPEND_CAP_SQL.indexOf('create or replace function public.reserve_ai_spend');
  const finalizeStart = SPEND_CAP_SQL.indexOf('create or replace function public.finalize_ai_spend_v2');
  assert.ok(reserveStart >= 0 && finalizeStart > reserveStart);
  const reserve = SPEND_CAP_SQL.slice(reserveStart, finalizeStart);
  const teamLock = reserve.indexOf('from public.teams where id = p_team_id for update');
  const committedSum = reserve.indexOf('select coalesce(sum(cost), 0)');
  const reservedSum = reserve.indexOf('select coalesce(sum(reserved_cost), 0)');
  const insert = reserve.indexOf('insert into public.ai_spend_reservations');
  assert.ok(teamLock >= 0 && teamLock < committedSum, 'el lock debe preceder las lecturas de saldo');
  assert.ok(committedSum < reservedSum && reservedSum < insert, 'la suma completa debe preceder la reserva');
  assert.match(reserve, /v_committed_cost \+ v_reserved_cost \+ p_reserved_cost > p_monthly_cap/);
});

test('el SQL aísla por Equipo, autoriza roles de consumo y usa meses UTC cerrados', () => {
  assert.match(SPEND_CAP_SQL, /team_id = p_team_id[\s\S]*user_id = p_user_id[\s\S]*role in \('owner', 'editor'\)[\s\S]*for key share/);
  assert.match(SPEND_CAP_SQL, /v_period_end timestamptz := \(date_trunc\('month', now\(\) at time zone 'UTC'\) \+ interval '1 month'\) at time zone 'UTC'/);
  assert.match(SPEND_CAP_SQL, /created_at >= v_period_start[\s\S]*created_at < v_period_end/);
  assert.match(SPEND_CAP_SQL, /where team_id = p_team_id[\s\S]*period_start = v_period_start/);
});

test('reservas huérfanas caducan sin borrar una llamada viva que cruza de mes', () => {
  const reserveStart = SPEND_CAP_SQL.indexOf('create or replace function public.reserve_ai_spend');
  const finalizeStart = SPEND_CAP_SQL.indexOf('create or replace function public.finalize_ai_spend_v2');
  const reserve = SPEND_CAP_SQL.slice(reserveStart, finalizeStart);
  assert.match(reserve, /created_at < now\(\) - interval '5 minutes'/);
  assert.doesNotMatch(reserve, /period_start < v_period_start/);
  assert.match(reserve, /period_start = v_period_start/);
});

test('el TTL supera la suma máxima de timeouts y reintentos configurados', () => {
  const ttl = SPEND_CAP_SQL.match(/created_at < now\(\) - interval '(\d+) minutes'/);
  const countTimeout = INDEX.match(/ANTHROPIC_TOKEN_COUNT_TIMEOUT_MS = ([\d_]+)/);
  const requestTimeout = INDEX.match(/ANTHROPIC_REQUEST_TIMEOUT_MS = ([\d_]+)/);
  const finalizeAttempts = INDEX.match(/USAGE_FINALIZE_ATTEMPTS = (\d+)/);
  const finalizeDelay = INDEX.match(/USAGE_FINALIZE_RETRY_DELAY_MS = ([\d_]+)/);
  assert.ok(ttl && countTimeout && requestTimeout && finalizeAttempts && finalizeDelay);
  const ttlMs = Number(ttl[1]) * 60_000;
  const maxTimeoutsMs = Number(countTimeout[1].replaceAll('_', ''))
    + Number(requestTimeout[1].replaceAll('_', ''))
    + (Number(finalizeAttempts[1]) - 1) * Number(finalizeDelay[1].replaceAll('_', ''));
  assert.ok(ttlMs > maxTimeoutsMs, `TTL ${ttlMs} ms debe superar ${maxTimeoutsMs} ms`);
});

test('la finalización cambia reserva por coste real e idempotente en una sola RPC', () => {
  const finalizeStart = SPEND_CAP_SQL.indexOf('create or replace function public.finalize_ai_spend_v2');
  const releaseStart = SPEND_CAP_SQL.indexOf('create or replace function public.release_ai_spend_v2', finalizeStart);
  const finalize = SPEND_CAP_SQL.slice(finalizeStart, releaseStart);
  assert.match(finalize, /p_actual_cost > v_reservation\.reserved_cost/);
  assert.match(finalize, /insert into public\.ai_usage[\s\S]*v_reservation\.created_at/);
  assert.ok(
    finalize.indexOf('insert into public.ai_usage') < finalize.indexOf('delete from public.ai_spend_reservations'),
    'primero debe confirmar el uso y luego eliminar la reserva dentro de la transacción'
  );
  assert.match(finalize, /ai_spend_reservation_outcomes[\s\S]*already_finalized/);
  assert.match(finalize, /return jsonb_build_object\('status', 'finalized'\)/);
});

test('tabla y RPC del tope no quedan expuestas a clientes', () => {
  assert.match(SPEND_CAP_SQL, /revoke all on table public\.ai_spend_reservations from public, anon, authenticated/);
  assert.match(SPEND_CAP_SQL, /revoke all on table public\.ai_spend_reservation_outcomes from public, anon, authenticated/);
  for (const fn of [
    'reserve_ai_spend', 'finalize_ai_spend_v2', 'release_ai_spend_v2',
  ]) {
    assert.match(SPEND_CAP_SQL, new RegExp(`revoke all on function public\\.${fn}\\(`));
  }
  assert.doesNotMatch(SPEND_CAP_SQL, /create or replace function public\.(?:finalize|release)_ai_spend\(/);
  assert.match(SPEND_CAP_SQL, /drop function if exists public\.finalize_ai_spend\(uuid, uuid, integer, integer, numeric\)/);
  assert.match(SPEND_CAP_SQL, /drop function if exists public\.release_ai_spend\(uuid, uuid\)/);
  assert.match(SPEND_CAP_SQL, /drop function if exists public\.ai_month_cost\(uuid\)/);
  assert.equal((SPEND_CAP_SQL.match(/to service_role;/g) || []).length, 3);
});
