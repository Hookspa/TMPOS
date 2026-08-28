// Flujo integrado de la Edge Function con red y Supabase mockeados. Se ejecuta
// el handler real de index.ts para fijar el orden de seguridad completo:
// autenticación → membresía → Anthropic → registro de uso.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'supabase', 'functions', 'claude', 'index.ts'), 'utf8');
const TEAM = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const OTHER_TEAM = '8a9b0c1d-2e3f-4a5b-9c6d-7e8f90123456';

function stripTypeScript(source) {
  return source
    .replace(/^import .*;\s*$/gm, '')
    .replace(/Deno\.env\.get\(([^)]+)\)!/g, 'Deno.env.get($1)')
    .replace(/\blet (raw|insertError): unknown\b/g, 'let $1')
    .replace(/\(b: any\)/g, '(b)')
    .replace(/function j\(obj: unknown, status: number\)/, 'function j(obj, status)');
}

function validBody(overrides = {}) {
  return { prompt: 'hola', model: 'claude-haiku-4-5', max_tokens: 200, feature: 'ideas', ...overrides };
}

async function loadHandler(options = {}) {
  const events = [];
  const memberships = options.memberships === undefined ? [{ team_id: TEAM }] : options.memberships;
  const memberResult = options.memberResult || { data: { user_id: 'user-1' }, error: null };
  const inserts = [...(options.inserts || [{ error: null }])];

  const membershipQuery = {
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    maybeSingle() {
      events.push('membresía');
      return Promise.resolve(memberResult);
    },
    then(resolve, reject) {
      events.push('membresía');
      return Promise.resolve({ data: memberships, error: options.membershipsError || null }).then(resolve, reject);
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
      if (table === 'team_members') return membershipQuery;
      assert.equal(table, 'ai_usage');
      return {
        async insert(row) {
          events.push('insert');
          assert.ok(row.team_id, 'ai_usage nunca puede recibir team_id NULL');
          options.onInsert?.(row);
          const result = inserts.length ? inserts.shift() : { error: null };
          if (result.throw) throw result.throw;
          return result;
        },
      };
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
      costOf: () => 0.001,
    },
    Deno: {
      env: { get: () => 'test-secret' },
      serve(fn) { handler = fn; },
    },
    fetch: async () => {
      events.push('fetch');
      return {
        ok: true,
        status: 200,
        async json() {
          return { content: [{ text: 'respuesta' }], usage: { input_tokens: 10, output_tokens: 5 } };
        },
      };
    },
    Response,
    Error,
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

test('team_id explícito fija el orden auth → membresía → fetch → insert', async () => {
  const { handler, events } = await loadHandler();
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 200);
  assert.equal(result.data.text, 'respuesta');
  assert.deepEqual(events, ['auth', 'membresía', 'fetch', 'insert']);
});

test('sin team_id deriva el único equipo antes de Anthropic y lo registra', async () => {
  let inserted;
  const { handler, events } = await loadHandler({ onInsert: (row) => { inserted = row; } });
  const result = await invoke(handler, validBody());
  assert.equal(result.status, 200);
  assert.equal(inserted.team_id, TEAM);
  assert.deepEqual(events, ['auth', 'membresía', 'fetch', 'insert']);
});

test('sin team_id rechaza cero, varios o error de consulta sin llamar Anthropic', async (t) => {
  const cases = [
    ['ninguno', [], null, 403],
    ['varios', [{ team_id: TEAM }, { team_id: OTHER_TEAM }], null, 400],
    ['membresía corrupta', [{ team_id: null }], null, 503],
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

test('un error verificando team_id explícito devuelve 503 y corta el flujo', async () => {
  const { handler, events } = await loadHandler({ memberResult: { data: null, error: { message: 'db caída' } } });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.status, 503);
  assert.deepEqual(events, ['auth', 'membresía']);
});

test('el INSERT reintenta y puede recuperarse', async () => {
  const { handler, events } = await loadHandler({
    inserts: [{ error: { message: 'temporal' } }, { error: null }],
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.data.logged, undefined);
  assert.deepEqual(events, ['auth', 'membresía', 'fetch', 'insert', 'insert']);
});

test('si ambos INSERT fallan conserva el texto y devuelve logged:false', async () => {
  let loggedError = '';
  const { handler, events } = await loadHandler({
    inserts: [{ error: { message: 'uno' } }, { throw: new Error('dos') }],
    onConsoleError: (msg) => { loggedError = msg; },
  });
  const result = await invoke(handler, validBody({ team_id: TEAM }));
  assert.equal(result.data.text, 'respuesta');
  assert.equal(result.data.logged, false);
  assert.match(loggedError, /ai_usage_insert_failed/);
  assert.deepEqual(events, ['auth', 'membresía', 'fetch', 'insert', 'insert']);
});
