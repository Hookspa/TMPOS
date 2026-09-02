const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT = fs.readFileSync(path.join(ROOT, 'js', 'releases.js'), 'utf8');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createClassList(classes = []) {
  const set = new Set(classes);
  return {
    add: (...items) => items.forEach(item => set.add(item)),
    remove: (...items) => items.forEach(item => set.delete(item)),
    toggle: (item, force) => {
      const on = force === undefined ? !set.has(item) : Boolean(force);
      if (on) set.add(item); else set.delete(item);
      return on;
    },
    contains: item => set.has(item),
    find: predicate => Array.from(set).find(predicate),
    [Symbol.iterator]: function* iterator() { yield* set; },
  };
}

function createWizardDocument(values) {
  const elements = new Map();
  const element = (id, initial = '') => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: initial,
        textContent: '',
        style: {},
        classList: createClassList(),
        setAttribute() {},
      });
    }
    return elements.get(id);
  };

  Object.entries(values).forEach(([id, value]) => { element(id, value).value = value; });
  element('wizard').classList.add('open');

  return {
    getElementById: id => element(id),
    querySelector: selector => {
      if (selector === '.cover-opt.sel') {
        return { classList: createClassList(['cover-opt', 'c4', 'sel']) };
      }
      return element(selector);
    },
    querySelectorAll: selector => {
      if (selector === '#wiz-mix .chip.on') {
        return ['awareness', 'storytelling'].map(textContent => ({ textContent }));
      }
      return [];
    },
  };
}

function loadWizardRuntime(context) {
  const start = CLIENT.indexOf('let wizStepN = 1;');
  const end = CLIENT.indexOf('function wizDelete()', start);
  assert.ok(start >= 0 && end > start, 'no se pudo aislar el runtime del wizard');
  return vm.runInNewContext(`${CLIENT.slice(start, end)}
({
  setEditingId(value) { editingId = value; },
  setDays(pre, post) { preDays = pre; postDays = post; },
  wizFinish,
})`, context);
}

test('editar el wizard por wizFinish conserva datos operativos y reasigna launches[i]', async () => {
  const untouchedLaunch = {
    id: 'L-ajeno',
    artistId: 'A-otro',
    name: 'Lanzamiento ajeno',
    cal: [{ id: 'ci-ajeno', fecha: '2026-09-01' }],
    goals: [{ id: 'goal-ajeno', target: '10K' }],
  };
  const existing = {
    id: 'L-operativo',
    artistId: 'A-tempo',
    name: 'Nombre anterior',
    type: 'album',
    tracklist: [{ trackId: 'TRK-viejo', order: 0 }],
    date: '2026-09-10',
    cover: 'c2',
    status: 'active',
    preDays: 21,
    postDays: 35,
    createdAt: 1780000000000,
    _updatedAt: 1780001000000,
    externalId: 'dist-123',
    dna: {
      about: 'ADN anterior',
      emotion: 'Tension',
      problem: 'Problema anterior',
      conversation: 'Conversacion anterior',
      message: 'Mensaje anterior',
      keywords: 'anteriores',
      collaboratorNotes: 'No pertenece al wizard',
    },
    content: {
      perweek: '3 piezas / semana',
      platform: 'TikTok',
      mix: ['bts'],
      approvalFlow: 'label-review',
    },
    budget: {
      total: '12000',
      meta: '4000',
      tiktok: '5000',
      dsp: '2000',
      prod: '1000',
      lines: [{ id: 'line-prod', label: 'Produccion', amount: 2500 }],
      reconciledAt: '2026-09-01',
    },
    cal: [{ id: 'ci-1', fecha: '2026-09-04', title: 'Teaser', production: { estado: 'grabando' } }],
    goals: [{ id: 'goal-1', metric: 'Streams', target: '150K', status: 'approved' }],
    letra: 'Letra completa',
    letraTraducida: 'Translated lyrics',
    hooks: ['primer hook', 'segundo hook'],
    tasks: [{ id: 'task-1', titulo: 'Subir canvas', estado: 'open' }],
    expenses: [{ id: 'exp-1', monto: 750, categoria: 'Video' }],
    planContenido: [{ categoria: 'BTS', pieza: 'Ensayo' }],
    generated: [{ title: 'Idea generada' }],
    generatedPrev: [{ title: 'Idea previa' }],
    ideas: [{ key: 'id:ref-1', title: 'Referencia' }],
    metrics: { cards: [{ metric: 'Streams' }], weeks: [{ week: '2026-W36' }] },
    metricEntries: [{ id: 'm1', platform: 'spotify', metric: 'Streams', value: 1000 }],
    revenue: { dsp: 120 },
    recoup: { ingresos: 120 },
    marketingPlan: { path: 'marketing-plans/L-operativo.pdf', name: 'Plan.pdf' },
    releaseChecklist: { visual: { cover: true }, distrib: { upc: true }, mkt: { plan: true } },
    assets: [{ id: 'asset-1', tipo: 'cover', url: 'https://example.com/cover.png' }],
    bizDefault: [{ partner: 'Label', madre: 70 }],
    upc: '123456789012',
    distributor: 'Distribuidora',
    notes: 'Notas internas',
    futurePlan: { nextSingle: '2027-01-15' },
  };

  const beforeExisting = clone(existing);
  const beforeUntouched = clone(untouchedLaunch);
  const calls = [];
  const context = {
    Date: class extends Date {
      static now() { return 1800000000000; }
    },
    document: createWizardDocument({
      'wiz-name': 'Nombre editado',
      'wiz-date': '2026-10-20',
      'wiz-type': 'ep',
      'wiz-tracks': 'Nuevo corte A\nNuevo corte B',
      'wiz-about': 'ADN editado',
      'wiz-emotion': 'Euforia',
      'wiz-problem': 'Nuevo problema',
      'wiz-conversation': 'Nueva conversacion',
      'wiz-message': 'Nuevo mensaje',
      'wiz-keywords': 'nuevas, claves',
      'wiz-perweek': '6 piezas / semana',
      'wiz-platform': 'Instagram Reels',
      'wiz-budget-total': '20000',
      'wiz-budget-meta': '8000',
      'wiz-budget-tiktok': '6000',
      'wiz-budget-dsp': '3000',
      'wiz-budget-prod': '3000',
    }),
    launches: [untouchedLaunch, existing],
    tracks: [{ id: 'TRK-viejo', artistId: 'A-tempo', title: 'Nombre anterior' }],
    currentArtistId: 'A-tempo',
    normalizeTrack: track => Object.assign({ type: 'track', tasks: [] }, track),
    saveLaunches: () => calls.push('saveLaunches'),
    saveTracks: () => calls.push('saveTracks'),
    renderAllLaunches: () => calls.push('renderAllLaunches'),
    openLaunch: id => calls.push(['openLaunch', id]),
    s: value => value == null ? '' : String(value),
  };

  const runtime = loadWizardRuntime(context);
  runtime.setEditingId('L-operativo');
  runtime.setDays(14, 28);
  await runtime.wizFinish();

  assert.equal(context.launches.length, 2);
  assert.deepEqual(context.launches[0], beforeUntouched);

  const result = clone(context.launches[1]);
  assert.notDeepEqual(result, beforeExisting);

  assert.equal(result.name, 'Nombre editado');
  assert.equal(result.type, 'ep');
  assert.deepEqual(
    result.tracklist.map(ref => ({ title: context.tracks.find(t => t.id === ref.trackId).title, order: ref.order })),
    [{ title: 'Nuevo corte A', order: 0 }, { title: 'Nuevo corte B', order: 1 }],
  );
  assert.equal(result.date, '2026-10-20');
  assert.equal(result.cover, 'c4');
  assert.equal(result.preDays, 14);
  assert.equal(result.postDays, 28);
  assert.equal(result.dna.about, 'ADN editado');
  assert.equal(result.content.platform, 'Instagram Reels');
  assert.deepEqual(result.content.mix, ['awareness', 'storytelling']);
  assert.equal(result.budget.total, '20000');

  assert.equal(result.id, 'L-operativo');
  assert.equal(result.artistId, 'A-tempo');
  assert.equal(result.status, 'active');
  assert.equal(result.createdAt, 1780000000000);
  assert.equal(result._updatedAt, 1780001000000);
  assert.equal(result.externalId, 'dist-123');
  assert.equal(result.dna.collaboratorNotes, 'No pertenece al wizard');
  assert.equal(result.content.approvalFlow, 'label-review');
  assert.deepEqual(result.budget.lines, existing.budget.lines);
  assert.equal(result.budget.reconciledAt, '2026-09-01');
  assert.deepEqual(result.cal, existing.cal);
  assert.deepEqual(result.goals, existing.goals);
  assert.equal(result.letra, 'Letra completa');
  assert.equal(result.letraTraducida, 'Translated lyrics');
  assert.deepEqual(result.hooks, existing.hooks);
  assert.deepEqual(result.tasks, existing.tasks);
  assert.deepEqual(result.expenses, existing.expenses);
  assert.deepEqual(result.planContenido, existing.planContenido);
  assert.deepEqual(result.marketingPlan, existing.marketingPlan);
  assert.deepEqual(result.releaseChecklist, existing.releaseChecklist);
  assert.deepEqual(result.assets, existing.assets);
  assert.deepEqual(result.futurePlan, existing.futurePlan);
  assert.deepEqual(calls, ['saveLaunches', 'saveTracks', 'renderAllLaunches', ['openLaunch', 'L-operativo']]);
});
