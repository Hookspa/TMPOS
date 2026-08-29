// Validación de entradas de la Edge Function "claude".
//
// El cuerpo del request lo controla el cliente. Antes, la función lo pasaba
// directo: cualquiera podía pedir un modelo arbitrario, un max_tokens arbitrario
// y cargarle el consumo al team_id de otro equipo. Estas pruebas fijan el
// contrato de validateBody() y los tres techos que evitan que eso vuelva.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const MODULE = pathToFileURL(
  path.join(__dirname, '..', '..', 'supabase', 'functions', 'claude', 'validate.mjs')
).href;

const TEAM = '3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

let v;
test.before(async () => { v = await import(MODULE); });

// ── prompt ──────────────────────────────────────────────────────────────────
test('el prompt es obligatorio y no puede ser vacío ni de otro tipo', () => {
  for (const bad of [undefined, null, '', '   ', 42, {}, [], true]) {
    const r = v.validateBody({ prompt: bad });
    assert.equal(r.ok, false, `aceptó un prompt inválido: ${JSON.stringify(bad)}`);
    assert.equal(r.status, 400);
  }
});

test('un prompt por encima del techo se rechaza en vez de gastarse', () => {
  const justo = v.validateBody({ prompt: 'a'.repeat(v.MAX_PROMPT_CHARS) });
  assert.equal(justo.ok, true, 'el largo exacto del techo debería pasar');
  const pasado = v.validateBody({ prompt: 'a'.repeat(v.MAX_PROMPT_CHARS + 1) });
  assert.equal(pasado.ok, false);
  assert.equal(pasado.status, 400);
});

test('un cuerpo que no es objeto se rechaza sin reventar', () => {
  for (const bad of [null, undefined, 'texto', 7]) {
    const r = v.validateBody(bad);
    assert.equal(r.ok, false, `aceptó un cuerpo inválido: ${JSON.stringify(bad)}`);
    assert.equal(r.status, 400);
  }
});

// ── model ───────────────────────────────────────────────────────────────────
test('solo pasan los modelos de la lista blanca', () => {
  for (const id of Object.keys(v.PRICES)) {
    assert.equal(v.resolveModel(id), id, `${id} debería estar permitido`);
  }
});

test('un modelo arbitrario se rechaza en vez de reenviarse a Anthropic', () => {
  for (const bad of ['claude-inventado', 'gpt-4', '../../etc/passwd', 'claude-opus-9', 42, {}, []]) {
    assert.equal(v.resolveModel(bad), null, `aceptó el modelo ${JSON.stringify(bad)}`);
  }
  const r = v.validateBody({ prompt: 'hola', model: 'gpt-4' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.match(r.error, /modelo no permitido/);
});

test('un modelo retirado se remapea a uno vigente, no se rechaza', () => {
  for (const [viejo, nuevo] of Object.entries(v.MODEL_MIGRATION)) {
    assert.equal(v.resolveModel(viejo), nuevo, `${viejo} debería migrar a ${nuevo}`);
  }
});

test('sin modelo se usa el default', () => {
  assert.equal(v.resolveModel(undefined), v.DEFAULT_MODEL);
  assert.equal(v.resolveModel(''), v.DEFAULT_MODEL);
  assert.equal(v.resolveModel('   '), v.DEFAULT_MODEL);
});

// ── max_tokens ──────────────────────────────────────────────────────────────
test('max_tokens se acota al techo del servidor', () => {
  assert.equal(v.resolveMaxTokens(v.MAX_TOKENS_CAP + 1), v.MAX_TOKENS_CAP);
  assert.equal(v.resolveMaxTokens(1e9), v.MAX_TOKENS_CAP);
});

// Infinity no es un número finito, así que cae al default (2000) en vez de al
// techo (4000). Los dos caminos son seguros; el default es el más conservador.
test('un max_tokens inválido cae al default en vez de propagarse', () => {
  for (const bad of [undefined, null, 0, -5, NaN, Infinity, -Infinity, true, '500', 'muchos', {}, [5], []]) {
    assert.equal(
      v.resolveMaxTokens(bad), v.DEFAULT_MAX_TOKENS,
      `${JSON.stringify(bad)} debería caer al default`
    );
  }
});

test('un max_tokens válido se respeta y se vuelve entero', () => {
  assert.equal(v.resolveMaxTokens(1200), 1200);
  assert.equal(v.resolveMaxTokens(700.9), 700);
});

// ── el techo contra la demanda REAL del cliente ─────────────────────────────
// Esta es la prueba que faltaba. Un cap de 4000 llego a produccion y recorto el
// JSON de 12 ideas en adelante: nadie habia contrastado el techo del servidor
// con lo que el cliente realmente pide. Se lee el calculo del fuente en vez de
// copiarlo, para que cambiarlo alli sin subir el cap rompa aqui.
test('el techo del servidor cubre el presupuesto maximo que pide el cliente', () => {
  const releases = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'releases.js'), 'utf8');
  const m = releases.match(
    /const maxTok = Math\.min\((\d+),\s*count \* (\d+) \+ (\d+)\)/);
  assert.ok(m, 'cambio el calculo de maxTok en js/releases.js: revisa MAX_TOKENS_CAP');
  const [, techoCliente, porIdea, base] = m.map(Number);

  // Cantidades que ofrece el selector de ideas.
  for (const count of [6, 8, 10, 12, 16, 20, 24]) {
    const pedido = Math.min(techoCliente, count * porIdea + base);
    assert.equal(
      v.resolveMaxTokens(pedido), pedido,
      `${count} ideas piden ${pedido} tokens y el servidor los recorta a ` +
      `${v.resolveMaxTokens(pedido)}: el JSON se trunca y parseIdeasJSON falla`
    );
  }
  assert.ok(
    v.MAX_TOKENS_CAP >= techoCliente,
    `MAX_TOKENS_CAP (${v.MAX_TOKENS_CAP}) es menor que el techo del cliente (${techoCliente})`
  );
});

// ── team_id ─────────────────────────────────────────────────────────────────
test('team_id debe ser un uuid; cualquier otra cosa se rechaza', () => {
  for (const bad of ['no-es-uuid', "' or 1=1--", 123, {}, [], 'x'.repeat(40)]) {
    const r = v.validateBody({ prompt: 'hola', team_id: bad });
    assert.equal(r.ok, false, `aceptó team_id ${JSON.stringify(bad)}`);
    assert.equal(r.status, 400);
  }
});

test('team_id ausente es válido y queda en null', () => {
  for (const empty of [undefined, null, '']) {
    const r = v.validateBody({ prompt: 'hola', team_id: empty });
    assert.equal(r.ok, true);
    assert.equal(r.value.teamId, null);
  }
});

test('un uuid válido se conserva tal cual', () => {
  const r = v.validateBody({ prompt: 'hola', team_id: TEAM });
  assert.equal(r.ok, true);
  assert.equal(r.value.teamId, TEAM);
});

// ── feature ─────────────────────────────────────────────────────────────────
test('feature se sanea para que no pueda romper el INSERT de ai_usage', () => {
  assert.equal(v.sanitizeFeature('pitch_editorial'), 'pitch_editorial');
  assert.equal(v.sanitizeFeature('plan-contenido'), 'plan-contenido');
  // Sin el saneo, un feature enorme o con caracteres raros hace fallar el INSERT
  // y el consumo de IA deja de quedar registrado.
  assert.equal(v.sanitizeFeature('x'.repeat(500)).length, v.MAX_FEATURE_CHARS);
  // El guion sí es válido (lo necesita 'plan-contenido'): lo que se cae son las
  // comillas, el punto y coma y los espacios, que es lo que rompería el INSERT.
  assert.equal(v.sanitizeFeature("'; drop table ai_usage;--"), 'droptableai_usage--');
  for (const bad of [undefined, null, 42, {}, '', '   ', '¡!¿?']) {
    assert.equal(v.sanitizeFeature(bad), null, `${JSON.stringify(bad)} debería dar null`);
  }
});

test('las features reales de la app sobreviven al saneo sin cambiar', () => {
  const reales = [
    'ideas', 'campaign_dna', 'traducir_letra', 'extraer_hooks',
    'pitch_editorial', 'plan_contenido', 'objetivos', 'reporte',
  ];
  for (const f of reales) {
    assert.equal(v.sanitizeFeature(f), f, `el saneo alteró la feature real ${f}`);
  }
});

// ── costo ───────────────────────────────────────────────────────────────────
test('el costo usa el precio del modelo, no un default silencioso', () => {
  const [inP, outP] = v.PRICES['claude-opus-5'];
  assert.equal(v.costOf('claude-opus-5', 1e6, 1e6), inP + outP);
  // Un modelo desconocido no debería llegar hasta aquí (resolveModel lo corta),
  // pero si llegara, cae al default en vez de explotar.
  assert.equal(typeof v.costOf('inexistente', 1000, 1000), 'number');
});

// ── contrato completo ───────────────────────────────────────────────────────
test('un cuerpo legítimo pasa entero y normalizado', () => {
  const r = v.validateBody({
    prompt: 'Genera 8 ideas',
    model: 'claude-3-5-haiku-latest', // retirado → debe migrar
    max_tokens: 99999,                // sobre el techo → debe acotarse
    team_id: TEAM,
    feature: 'ideas',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    prompt: 'Genera 8 ideas',
    model: 'claude-haiku-4-5',
    maxTokens: v.MAX_TOKENS_CAP,
    teamId: TEAM,
    feature: 'ideas',
  });
});
