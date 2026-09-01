// Los ids de modelo de Anthropic se retiran con fecha: claude-3-5-haiku quedó
// muerto el 2026-02-19 y la app siguió pidiéndolo seis meses, devolviendo 404 en
// silencio. Estas pruebas fijan las dos invariantes que lo habrían detectado:
// ningún id retirado sigue siendo un destino, y las dos tablas (cliente y Edge
// Function) no se separan.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'releases.js'), 'utf8');

// Modelos retirados por Anthropic. Ninguno puede ser un destino: si aparece del
// lado derecho de una migración, o como default, la IA vuelve a romperse.
const RETIRED = [
  'claude-3-5-haiku-latest',
  'claude-3-5-haiku-20241022',
  'claude-3-haiku-20240307',
  'claude-3-5-sonnet-latest',
  'claude-3-7-sonnet-20250219',
  'claude-sonnet-4-20250514',
  'claude-3-opus-latest',
  'claude-3-opus-20240229',
  'claude-2.1',
  'claude-2.0',
];

// Subconjunto que TEMPO pudo haber guardado alguna vez: los ids que ofreció el
// selector de modelo o que trae un backup. Solo estos necesitan reemplazo; los
// demás retirados (claude-2.x) nunca fueron valores posibles de esta app.
const MIGRATABLE = RETIRED.filter(id => !id.startsWith('claude-2.'));

// Extrae `const NOMBRE = {...};` del fuente y lo evalúa aislado. Se lee el fuente
// en vez de importarlo porque js/releases.js es un script de scope global con
// dependencias de DOM: no se puede require() sin arrastrar toda la app. El lado
// servidor no necesita esto — validate.mjs es un módulo y se importa de verdad.
function literal(source, name) {
  const start = source.indexOf(`const ${name}`);
  assert.notEqual(start, -1, `falta la declaración de ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  assert.notEqual(end, -1, `objeto sin cerrar en ${name}`);
  // Round-trip por JSON: vm devuelve objetos de otro realm y deepStrictEqual
  // compara prototipos, así que dos tablas idénticas fallarían la comparación.
  return JSON.parse(JSON.stringify(vm.runInNewContext(`(${source.slice(open, end)})`)));
}

function stringConst(source, name) {
  const m = source.match(new RegExp(`const ${name}(?::\\s*\\w+)?\\s*=\\s*["']([^"']+)["']`));
  assert.ok(m, `falta la constante ${name}`);
  return m[1];
}

const clientDefault = stringConst(CLIENT, 'AI_DEFAULT_MODEL');
const clientPrices = literal(CLIENT, 'AI_MODEL_PRICES');
const clientMigration = literal(CLIENT, 'AI_MODEL_MIGRATION');

let edge;
test.before(async () => {
  edge = await import(
    require('node:url').pathToFileURL(
      path.join(ROOT, 'supabase', 'functions', 'claude', 'validate.mjs')
    ).href
  );
});

test('ningún modelo retirado sobrevive como destino', () => {
  for (const [name, def] of [['cliente', clientDefault], ['edge', edge.DEFAULT_MODEL]]) {
    assert.ok(!RETIRED.includes(def), `el default de ${name} es un modelo retirado: ${def}`);
  }
  for (const [name, map] of [['cliente', clientMigration], ['edge', edge.MODEL_MIGRATION]]) {
    for (const [from, to] of Object.entries(map)) {
      assert.ok(!RETIRED.includes(to), `${name}: ${from} migra a ${to}, también retirado`);
    }
  }
  for (const [name, prices] of [['cliente', clientPrices], ['edge', edge.PRICES]]) {
    for (const id of RETIRED) {
      assert.ok(!Object.hasOwn(prices, id), `${name}: ${id} retirado sigue siendo clave de precios`);
    }
  }
});

test('aiSettings ejecuta la migración legada y devuelve precios vigentes', () => {
  const start = CLIENT.indexOf('function aiSettings()');
  const end = CLIENT.indexOf('// ── Capa de IA reutilizable', start);
  assert.ok(start >= 0 && end > start, 'no se pudo aislar aiSettings()');
  const localStorage = {
    getItem(key) {
      assert.equal(key, 'ao_ai_settings');
      return JSON.stringify({
        model: 'claude-3-5-haiku-latest',
        priceIn: 0.80,
        priceOut: 4.00,
      });
    },
  };
  const actual = vm.runInNewContext(
    `${CLIENT.slice(CLIENT.indexOf('const AI_DEFAULT_MODEL'), end)}\naiSettings()`,
    { localStorage }
  );
  assert.equal(actual.model, 'claude-haiku-4-5');
  assert.equal(actual.priceIn, 1.00);
  assert.equal(actual.priceOut, 5.00);
});

test('cada modelo retirado que TEMPO pudo guardar tiene reemplazo en ambos lados', () => {
  for (const id of MIGRATABLE) {
    assert.ok(clientMigration[id], `el cliente no remapea ${id}`);
    assert.ok(edge.MODEL_MIGRATION[id], `la Edge Function no remapea ${id}`);
  }
});

test('todo destino de migración tiene precio, o el costo se reporta mal', () => {
  for (const [name, map, prices] of [
    ['cliente', clientMigration, clientPrices],
    ['edge', edge.MODEL_MIGRATION, edge.PRICES],
  ]) {
    for (const to of new Set(Object.values(map))) {
      assert.ok(prices[to], `${name}: ${to} no tiene precio en la tabla`);
    }
  }
});

test('cliente y Edge Function no se separan', () => {
  assert.equal(clientDefault, edge.DEFAULT_MODEL, 'los defaults difieren');
  assert.deepEqual(clientPrices, edge.PRICES, 'las tablas de precio difieren');
  assert.deepEqual(clientMigration, edge.MODEL_MIGRATION, 'los mapas de migración difieren');
  assert.ok(clientPrices[clientDefault], 'el modelo por defecto no tiene precio');
});
