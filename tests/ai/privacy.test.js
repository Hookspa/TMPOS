// El costo, los tokens y el modelo son detalles internos. Este test fija que
// js/releases.js falle cerrado si team.js no llega a definir isAdmin().
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'releases.js'), 'utf8');

function functionBlock(name) {
  const start = CLIENT.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `falta la función ${name}`);
  const rest = CLIENT.slice(start + 1);
  const next = rest.match(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  return next ? CLIENT.slice(start, start + 1 + next.index) : CLIENT.slice(start);
}

test('el gate de detalles de IA falla cerrado y solo abre para el super-admin', () => {
  const gate = functionBlock('puedeVerDetallesAdminIA');
  const run = context => vm.runInNewContext(`${gate}\npuedeVerDetallesAdminIA()`, context);

  assert.equal(run({}), false, 'sin isAdmin debe ocultar los detalles');
  assert.equal(run({ isAdmin: () => false }), false, 'un usuario final no debe verlos');
  assert.equal(run({ isAdmin: () => { throw new Error('team.js roto'); } }), false,
    'si isAdmin falla debe ocultar los detalles');
  assert.equal(run({ isAdmin: () => true }), true, 'el super-admin debe conservar los detalles');
});

test('todos los costos y mensajes con modelo pasan por el gate cerrado', () => {
  for (const name of ['renderResults', 'aiHintHTML', 'usageBadge', 'updateCostLine']) {
    assert.match(functionBlock(name), /puedeVerDetallesAdminIA\(\)/,
      `${name} no protege el costo y los tokens con el gate común`);
  }

  const modelDetail = /puedeVerDetallesAdminIA\(\)\s*\?\s*` \(\$\{s\(ai\.model\)\}\)`\s*:\s*''/;
  for (const name of [
    'generarIdeasIA',
    'generarDNADesdeLetra',
    'traducirLetra',
    'generarPitchEditorial',
    'generarPlanContenido',
  ]) {
    assert.match(functionBlock(name), modelDetail,
      `${name} muestra el modelo sin comprobar al super-admin`);
  }
});

test('el helper global de privacidad tiene un nombre único en js', () => {
  const definitions = fs.readdirSync(path.join(ROOT, 'js'))
    .filter(file => file.endsWith('.js'))
    .flatMap(file => {
      const source = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
      return [...source.matchAll(/function\s+puedeVerDetallesAdminIA\s*\(/g)]
        .map(match => `${file}:${match.index}`);
    });
  assert.deepEqual(definitions, ['releases.js:' + CLIENT.indexOf('function puedeVerDetallesAdminIA(')]);
});
