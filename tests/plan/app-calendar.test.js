const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const APP_HTML = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8');
const TempoPlan = require('../../js/plan.js');

function fragment(startNeedle, endNeedle) {
  const start = APP.indexOf(startNeedle);
  const end = APP.indexOf(endNeedle, start);
  assert.ok(start >= 0, `no se encontró ${startNeedle}`);
  assert.ok(end > start, `no se encontró ${endNeedle}`);
  return APP.slice(start, end);
}

function baseRuntime(extra = '') {
  const prefix = fragment('// UTILS', '// ══════════════════════════════════════════\n// TRADUCCIÓN');
  const navigation = fragment('// NAVEGACIÓN', '// ══════════════════════════════════════════\n// BANCO — filtros dinámicos');
  const bank = fragment('// BANCO — filtros dinámicos', '// ══════════════════════════════════════════\n// FAVORITOS');
  const generation = fragment('let _calGenerationUndo = null;', '// Crea un post directo en el calendario');
  const handlers = fragment('// Crea un post directo en el calendario', '// ══════════════════════════════════════════\n// CALENDARIO');
  const production = fragment('// CENTRO DE PRODUCCIÓN (Módulo 9)', '// Render compartido (producción y banco)');
  const calls = [];
  const permissions = { canEdit: true };
  const elements = {};
  function makeElement(id) {
    return elements[id] || (elements[id] = {
      id,
      value: '',
      innerHTML: '',
      textContent: '',
      style: {},
      className: '',
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      dataset: {},
      addEventListener() {},
      removeEventListener() {},
      appendChild() {},
      setAttribute() {},
      removeAttribute() {},
      focus() {},
    });
  }
  const context = {
    __calls: calls,
    __permissions: permissions,
    __elements: elements,
    window: { TempoPlan },
    TempoPlan,
    icon: () => '',
    localStorage: {
      _data: {},
      getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
      setItem(key, value) {
        this._data[key] = String(value);
        if (key === 'ao_ref_usage') {
          const usage = JSON.parse(String(value) || '{}');
          const last = Object.entries(usage).sort((a, b) => b[1] - a[1])[0];
          if (last) calls.push(['usage', last[0].replace(/^id:/, ''), last[1]]);
        }
      },
    },
    document: {
      body: { classList: { remove() {}, toggle() {}, contains() { return false; } } },
      getElementById: id => makeElement(id),
      querySelector: selector => {
        if (selector === '.page.active') return { id: 'page-calendario' };
        if (selector === '.content') return makeElement('content');
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (type, fn) => calls.push(['add-listener', type, typeof fn]),
      removeEventListener: (type, fn) => calls.push(['remove-listener', type, typeof fn]),
      createElement: id => makeElement(id),
    },
    setTimeout: fn => { calls.push('timeout'); if (typeof fn === 'function') fn(); return 1; },
    currentLaunchId: 'L1',
    currentTrackId: null,
    currentArtistId: 'A1',
    _releaseTab: 'resumen',
    _viewingTrack: false,
    _navStack: [],
    _navSuppress: false,
    _shuffleKey: 1,
    saveLaunchesLocal: () => calls.push('local'),
    saveLaunches: () => calls.push('cloud-save'),
    scheduleCloudSync: () => calls.push('cloud-sync'),
    renderCatalogStatus: () => calls.push('catalog-status'),
    renderBanco: () => calls.push('render-banco'),
    renderFiltros: () => calls.push('render-filtros'),
    renderCalendar: () => calls.push('render-calendar'),
    renderLaunchDetail: () => calls.push('render-detail'),
    renderKanban: () => calls.push('render-kanban'),
    renderObjetivos: () => calls.push('render-objetivos'),
    renderMetricas: () => calls.push('render-metricas'),
    renderArtistForms: () => calls.push('render-artist-forms'),
    renderIdeas: () => calls.push('render-ideas'),
    renderAprendizajes: () => calls.push('render-aprendizajes'),
    renderIA: () => calls.push('render-ia'),
    renderLaunches: () => calls.push('render-launches'),
    renderCompas: () => calls.push('render-compas'),
    renderAnnualPlan: () => calls.push('render-annual-plan'),
    renderTareas: () => calls.push('render-tareas'),
    renderCampanias: () => calls.push('render-campanias'),
    renderDashboard: () => calls.push('render-dashboard'),
    renderLabel: () => calls.push('render-label'),
    renderOnAir: () => calls.push('render-on-air'),
    cerrarMoreSheet: () => calls.push('close-more'),
    releaseRestorePages: () => calls.push('release-restore'),
    compasRestore: () => calls.push('compas-restore'),
    hydrateIcons: () => calls.push('hydrate'),
    updateProductionLockControl: () => calls.push('lock-control'),
    uiToast: message => calls.push(['toast', message]),
    uiAlert: message => calls.push(['alert', message]),
    uiConfirm: async message => { calls.push(['confirm', message]); return true; },
    canDo: () => permissions.canEdit,
    requireCan: () => permissions.canEdit,
    launchDateLabel: launch => launch && launch.date,
    STATUS_MAP: { planning: { cls: 'status-planning', word: 'Planeando' } },
  };
  const api = vm.runInNewContext(`
let launches = [];
let calView = 'calendar';
let artists = [];
let bancoTranslate = false;
function activeLaunch() { return launches.find(item => item.id === currentLaunchId) || null; }
function activeArtist() { return artists.find(item => item.id === currentArtistId) || artists[0] || null; }
function artistLaunches() { return launches.filter(item => item.artistId === currentArtistId && item.type !== 'evergreen'); }
function artistEvergreen() { return launches.filter(item => item.artistId === currentArtistId && item.type === 'evergreen'); }
function launchContextHTML() { return '<div class="launch-ctx">Lanzamiento</div>'; }
function refThumbImmediate(r) { return r && r.thumb || ''; }
function openRefBoxdrop(idx) { __calls.push(['open-ref', idx]); }
function trTag(value) { return value; }
function trText(value) { return value; }
function catColor() { return '#ff6900'; }
${prefix}
${navigation}
${bank}
${generation}
${handlers}
${production}
${extra}
({
  calls: __calls,
  elements: __elements,
  setLaunches(value) { launches = value; },
  setActiveLaunch(value) { currentLaunchId = value; },
  getActiveLaunch() { return currentLaunchId; },
  setArtists(value) { artists = value; },
  setBankReady(value) { bancoCargado = value; },
  setReferencias(value) { referencias = value; },
  setConfirm(value) { uiConfirm = value; },
  setCanEdit(value) { __permissions.canEdit = value; },
  resolveAI(value) { if (typeof _resolveAI === 'function') _resolveAI(value); },
  resolveContent(index, value) { if (typeof _contentResolvers !== 'undefined' && _contentResolvers[index]) _contentResolvers[index](value); },
  setProdContext(launchId, itemId) { prodCtx = { launchId, itemId }; },
  getLaunches() { return launches; },
  calItemLocked,
  lockCalItem,
  unlockCalItem,
  normalizeCalItem,
  validLaunchDate,
  generateOfflineCalendarForLaunch,
  applyAssistedCalendarPlan,
  assistCalendarPlan,
  queueOfflineCalendarGeneration,
  flushOfflineCalendarGenerationQueue,
  undoOfflineCalendarGeneration,
  undoActiveCalendarOffline,
  beginBankChoiceReplacement,
  cancelBankChoiceReplacement,
  chooseBankReplacement,
  bankChoiceActive,
  renderBancoContext,
  renderBancoToolbar,
  renderBanco,
  showPage,
  deleteCalItem,
  calDragStart,
  calDropOnDay,
  replaceCalItem,
  replaceCalItemWithAutomaticSuggestion,
  planReplacementCandidates,
  planRecommendationReason,
  toggleCalItemLock,
  prodItem,
  prodSet,
  prodSetFecha,
  prodSetPauta,
  moveCalItem,
  prodGuionAdd,
  prodGuionDel,
  prodGuionSet,
  prodShotAdd,
  prodShotDel,
  prodShotSet,
  prodAssetAdd,
  prodAssetDel,
  prodAssetSet,
  prodBriefHTML,
  generarContenidoIA,
});
`, context);
  return api;
}

test('validLaunchDate acepta una fecha ISO válida sin depender de la conversión de medianoche local a UTC', () => {
  const rt = baseRuntime(`
    Date = class LocalEastOfUtcDate {
      static UTC(year, month, day) {
        return month === 1 && day === 30 ? { year, month: 2, day: 2 } : { year, month, day };
      }
      static now() { return 0; }
      constructor(value) { this.value = value; }
      getTime() { return 1; }
      toISOString() { return '2026-09-30T22:00:00.000Z'; }
      getUTCFullYear() { return this.value.year; }
      getUTCMonth() { return this.value.month; }
      getUTCDate() { return this.value.day; }
    };
  `);

  assert.equal(rt.validLaunchDate('2026-10-01'), true);
  assert.equal(rt.validLaunchDate('2026-02-30'), false);
});

test('regeneración manual rechaza fechas ISO inexistentes sin sobrescribir el calendario', () => {
  const rt = baseRuntime();
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  const original = [{ id: 'manual-1', source: 'manual', locked: true, fecha: '2026-02-28', title: 'Conservar' }];
  rt.setLaunches([{ id: 'L-invalid', date: '2026-02-30', cal: original }]);

  assert.equal(rt.generateOfflineCalendarForLaunch('L-invalid'), null);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), JSON.stringify(original));
});

test('la UI de reemplazo escapa categorías y serializa IDs para handlers inline', () => {
  assert.match(APP, /\$\{esc\(cats\.map\(up\)\.join\(' · '\) \|\| up\(ci\.phase \|\| ''\)\)\}/);
  assert.match(APP, /openPlanReplacement\(\$\{jsArg\(ci\._campId\)\},\$\{jsArg\(ci\.id\)\}\)/);
  assert.match(APP, /openPlanReplacement\(\$\{jsArg\(launchId\)\},\$\{jsArg\(ci\.id\)\}\)/);
});

test('generar/deshacer calendario es local-only y preserva bloqueadas con refs custom', () => {
  const rt = baseRuntime();
  rt.setReferencias([
    { id: 'custom-direct', title: 'Custom', cat: ['song promotion'], custom: true, energy: 'high' },
    { id: 'owned-direct', title: 'Owned', cat: ['performance'], owned: true, energy: 'medium' },
    { id: 'community-direct', title: 'Community', cat: ['engagement'], community: true, energy: 'low' },
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `public-${index}`,
      title: `Public ${index}`,
      cat: ['song promotion', 'performance', 'engagement'][index % 3],
      energy: ['high', 'medium', 'low'][index % 3],
      link: `https://example.com/${index}`,
    })),
  ]);
  rt.setLaunches([{
    id: 'L1',
    date: '2026-10-01',
    preDays: 2,
    postDays: 2,
    cal: [
      { id: 'human', source: 'manual', locked: true, fecha: '2026-09-29', title: 'Human custom', refId: 'custom-direct' },
      { id: 'old-plan', source: 'plan', fecha: '2026-09-30', title: 'Plan reemplazable' },
    ],
  }]);

  const generated = rt.generateOfflineCalendarForLaunch('L1');
  const launch = rt.getLaunches()[0];

  assert.equal(generated.generatedCount, 4);
  assert.equal(generated.lockedCount, 1);
  assert.equal(launch.cal.find(item => item.id === 'human').refId, 'custom-direct');
  assert.equal(launch.cal.some(item => item.id === 'old-plan'), false);
  assert.equal(launch.cal.some(item => item.fecha === '2026-09-29' && item.source === 'plan'), false);
  assert.equal(launch.cal.filter(item => item.fecha === '2026-10-01' && item.source === 'plan').length, 1);
  assert.equal(launch.cal.some(item => item.source === 'plan' && (item.anchor || item.anchorKey)), false);
  assert.ok(launch.cal.filter(item => item.source === 'plan').every(item => !['custom-direct', 'owned-direct', 'community-direct'].includes(item.refId)));
  assert.equal(rt.calls.includes('cloud-sync'), false);
  assert.equal(rt.calls.includes('cloud-save'), false);

  assert.equal(rt.undoOfflineCalendarGeneration('L1'), true);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal.map(item => item.id)), JSON.stringify(['human', 'old-plan']));
  assert.equal(rt.calls.includes('cloud-sync'), false);
  assert.equal(rt.calls.includes('cloud-save'), false);
});

test('regeneración preserva plantillas desbloqueadas y evita IDs duplicados al cambiar fecha', () => {
  const rt = baseRuntime();
  rt.setReferencias([
    { id: 'public-1', title: 'Pública 1', cat: ['song promotion'], energy: 'medium' },
    { id: 'public-2', title: 'Pública 2', cat: ['performance'], energy: 'medium' },
  ]);
  const template = { id: 'template-1', source: 'template', locked: false, fecha: '2026-09-29', title: 'Plantilla humana' };
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', preDays: 2, postDays: 1, cal: [template] }]);

  rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  let launch = rt.getLaunches()[0];
  assert.ok(launch.cal.some(item => item.id === 'template-1'));
  assert.equal(new Set(launch.cal.map(item => item.fecha)).size, launch.cal.length);
  const piece = launch.cal.find(item => item.source === 'plan');
  assert.ok(piece);
  piece.locked = true;
  piece.humanLocked = true;
  launch.date = '2026-10-02';

  rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  launch = rt.getLaunches()[0];
  const ids = launch.cal.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(launch.cal.some(item => item.id === 'template-1'));
  assert.ok(launch.cal.some(item => item.id === piece.id && item.locked));
});

test('la generación exige permiso de edición incluso por una entrada directa', () => {
  const rt = baseRuntime();
  const original = [{ id: 'manual-1', source: 'manual', locked: true, fecha: '2026-10-01', title: 'Conservar' }];
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', cal: original }]);
  rt.setCanEdit(false);

  assert.equal(rt.generateOfflineCalendarForLaunch('L1'), null);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), JSON.stringify(original));
});

test('deshacer exige permiso de edición y no muta el calendario para solo lectura', () => {
  const rt = baseRuntime();
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', preDays: 1, postDays: 1, cal: [] }]);
  rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  const before = JSON.stringify(rt.getLaunches()[0].cal);

  rt.setCanEdit(false);
  assert.equal(rt.undoOfflineCalendarGeneration('L1'), false);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), before);
});

test('la guarda de evergreen impide generar o sobrescribir una campaña always-on', () => {
  const rt = baseRuntime();
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setLaunches([{
    id: 'EVER', artistId: 'A1', type: 'evergreen', status: 'evergreen', date: '2026-10-01', preDays: 1, postDays: 1,
    cal: [{ id: 'manual-ever', source: 'manual', locked: true, fecha: '2026-10-01', title: 'No tocar' }],
  }]);

  assert.equal(rt.generateOfflineCalendarForLaunch('EVER'), null);
  assert.deepEqual(rt.getLaunches()[0].cal, [{ id: 'manual-ever', source: 'manual', locked: true, fecha: '2026-10-01', title: 'No tocar' }]);
  assert.equal(rt.calls.includes('local'), false);
  assert.equal(rt.calls.includes('cloud-save'), false);
});

test('la integración asistida conserva el plan offline como fallback y solo persiste metadatos seguros', async () => {
  const rt = baseRuntime(`
function aiReady() { return true; }
function checkPlanLimit() { return { ok: true }; }
async function bumpTeamCounter(field) { __calls.push(['ai-counter', field]); }
async function callClaude(prompt) {
  const slots = Array.from(prompt.matchAll(/pieceId: ([^ ]+)/g)).map(match => match[1]);
  const refs = Array.from(prompt.matchAll(/id: ([^ ]+) \\| título/g)).map(match => match[1]);
  return { text: JSON.stringify({ selections: [
    { pieceId: slots[0], refId: refs[1], reason: 'Equilibra el inicio.' },
    { pieceId: slots[1], refId: refs[0], reason: 'Cierra el intercambio.' },
  ] }), usage: { input_tokens: 12, output_tokens: 6 }, ai: { model: 'private-provider' } };
}
`);
  rt.setReferencias([
    { id: 'public-1', title: 'Pública 1', cat: ['song promotion'], energy: 'medium' },
    { id: 'public-2', title: 'Pública 2', cat: ['performance'], energy: 'medium' },
    { id: 'public-3', title: 'Pública 3', cat: ['engagement'], energy: 'medium' },
  ]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', preDays: 1, postDays: 1,
    cal: [{ id: 'template-unlocked', source: 'template', locked: false, fecha: '2026-09-30', title: 'Plantilla' }] }]);
  const generated = rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  const result = await rt.assistCalendarPlan(generated.launch, { silent: true });
  const launch = rt.getLaunches()[0];

  assert.equal(result.mode, 'assisted');
  assert.ok(launch.cal.some(item => item.id === 'template-unlocked'));
  assert.equal(launch.planMeta.mode, 'assisted');
  assert.match(launch.planMeta.summary, /IA ordenó/);
  assert.equal(JSON.stringify(launch.planMeta).includes('private-provider'), false);
  assert.equal(JSON.stringify(launch.planMeta).includes('input_tokens'), false);
  const counters = rt.calls.filter(call => Array.isArray(call) && call[0] === 'ai-counter');
  assert.equal(counters.length, 1);
  assert.equal(counters[0][1], 'ideas_generadas_mes');
});

test('asistencia cancelada por edición humana no sobrescribe el reemplazo manual', () => {
  const rt = baseRuntime();
  rt.setReferencias([
    { id: 'old', title: 'Anterior', cat: ['performance'], energy: 'medium' },
    { id: 'human', title: 'Humana', cat: ['reaction'], energy: 'medium' },
  ]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', cal: [{ id: 'piece-1', source: 'plan', fecha: '2026-10-01', refId: 'old', title: 'Anterior' }] }]);
  const target = rt.getLaunches()[0];
  rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  const piece = target.cal.find(item => item.source === 'plan');
  assert.equal(rt.replaceCalItem('L1', piece.id, { refId: 'human', title: 'Elegida por una persona' }), true);
  const result = { mode: 'assisted', meta: {}, plan: { pieces: [{ id: piece.id, source: 'plan', fecha: piece.fecha, refId: 'old', title: 'Respuesta IA' }] } };

  assert.equal(rt.applyAssistedCalendarPlan(target, result, { generationVersion: 1, silent: true }), null);
  assert.equal(rt.getLaunches()[0].cal.find(item => item.id === piece.id).refId, 'human');
});

test('asistencia conserva una pieza bloqueada sin duplicar su ID en el resultado', () => {
  const rt = baseRuntime();
  const locked = { id: 'piece-locked', source: 'plan', locked: true, fecha: '2026-10-01', title: 'Reservada', production: {} };
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', cal: [locked] }]);
  const result = {
    mode: 'assisted',
    meta: { summary: 'Ordenado.' },
    plan: { pieces: [
      { id: 'piece-locked', fecha: '2026-10-01', title: 'No sobrescribir', cat: 'awareness', production: {} },
      { id: 'piece-new', fecha: '2026-10-02', title: 'Nueva', cat: 'performance', production: {} },
    ] },
  };

  assert.equal(rt.applyAssistedCalendarPlan(rt.getLaunches()[0], result, { silent: true }).mode, 'assisted');
  const items = rt.getLaunches()[0].cal;
  assert.equal(items.filter(item => item.id === 'piece-locked').length, 1);
  assert.equal(items.find(item => item.id === 'piece-locked').locked, true);
  assert.equal(items.some(item => item.id === 'piece-new'), true);
});

test('asistencia revalida el permiso al resolver y no registra cuota tras una revocación', async () => {
  const rt = baseRuntime(`
    function aiReady() { return true; }
    function checkPlanLimit() { return { ok: true }; }
    let _resolveAI;
    async function callClaude(prompt) {
      const slots = Array.from(prompt.matchAll(/pieceId: ([^ ]+)/g)).map(match => match[1]);
      const refs = Array.from(prompt.matchAll(/id: ([^ ]+) \\| título/g)).map(match => match[1]);
      return await new Promise(resolve => {
        _resolveAI = () => resolve({ text: JSON.stringify({ selections: [
          { pieceId: slots[0], refId: refs[1], reason: 'Alterna el formato.' },
        ] }) });
      });
    }
  `);
  rt.setReferencias([
    { id: 'public-1', title: 'Pública 1', cat: ['song promotion'], energy: 'medium' },
    { id: 'public-2', title: 'Pública 2', cat: ['performance'], energy: 'medium' },
  ]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', preDays: 1, postDays: 1, cal: [] }]);
  const generated = rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  const calendarBeforeResolution = JSON.stringify(rt.getLaunches()[0].cal);
  const pending = rt.assistCalendarPlan(generated.launch, { silent: true, generationVersion: 1 });
  await new Promise(resolve => setImmediate(resolve));
  rt.setCanEdit(false);
  rt.resolveAI();

  assert.equal(await pending, null);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), calendarBeforeResolution);
  assert.equal(rt.calls.some(call => Array.isArray(call) && call[0] === 'ai-counter'), false);
});

test('deshacer invalida una asistencia IA pendiente y conserva el calendario restaurado', async () => {
  const rt = baseRuntime(`
    function aiReady() { return true; }
    function checkPlanLimit() { return { ok: true }; }
    let _resolveAI;
    async function callClaude(prompt) {
      const slots = Array.from(prompt.matchAll(/pieceId: ([^ ]+)/g)).map(match => match[1]);
      const refs = Array.from(prompt.matchAll(/id: ([^ ]+) \\| título/g)).map(match => match[1]);
      return await new Promise(resolve => {
        _resolveAI = () => resolve({ text: JSON.stringify({ selections: [
          { pieceId: slots[0], refId: refs[1], reason: 'Alterna el formato.' },
        ] }), usage: { input_tokens: 1, output_tokens: 1 } });
      });
    }
  `);
  rt.setReferencias([
    { id: 'public-1', title: 'Pública 1', cat: ['song promotion'], energy: 'medium' },
    { id: 'public-2', title: 'Pública 2', cat: ['performance'], energy: 'medium' },
  ]);
  const original = [{ id: 'manual-1', source: 'manual', locked: true, fecha: '2026-09-30', title: 'Conservar' }];
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', preDays: 1, postDays: 1, cal: original }]);

  rt.generateOfflineCalendarForLaunch('L1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rt.undoOfflineCalendarGeneration('L1'), true);
  rt.resolveAI();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), JSON.stringify(original));
});

test('deshacer desde el calendario pide confirmación y restaura solo al aprobar', async () => {
  const rt = baseRuntime();
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', preDays: 1, postDays: 1,
    cal: [{ id: 'old-plan', source: 'plan', fecha: '2026-09-30', title: 'Plan anterior' }] }]);
  rt.setActiveLaunch('L1');
  rt.generateOfflineCalendarForLaunch('L1');
  assert.equal(rt.getLaunches()[0].cal.some(item => item.id === 'old-plan'), false);

  rt.setConfirm(async () => false);
  assert.equal(await rt.undoActiveCalendarOffline(), false);
  assert.equal(rt.getLaunches()[0].cal.some(item => item.id === 'old-plan'), false);

  rt.setConfirm(async () => true);
  assert.equal(await rt.undoActiveCalendarOffline(), true);
  assert.equal(rt.getLaunches()[0].cal.some(item => item.id === 'old-plan'), true);
});

test('una aprobación ADN antigua no se reutiliza después de regeneración manual', async () => {
  const rt = baseRuntime();
  rt.setBankReady(true);
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setArtists([{ id: 'A1', adn: { personality: { tone: 'Íntimo', archetypes: [] }, sound: {}, universe: {} } }]);
  rt.setLaunches([{ id: 'L1', artistId: 'A1', date: '2026-10-01', preDays: 1, postDays: 1, cal: [] }]);

  let confirmCalls = 0;
  let resolveFirst;
  rt.setConfirm(() => {
    confirmCalls += 1;
    if (confirmCalls === 1) return new Promise(resolve => { resolveFirst = resolve; });
    return new Promise(() => {});
  });

  rt.queueOfflineCalendarGeneration('A1');
  await new Promise(resolve => setImmediate(resolve));
  rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  resolveFirst(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(rt.getLaunches()[0].planMeta.autoGeneratedFromADN, true);

  assert.equal(rt.undoOfflineCalendarGeneration('L1'), true);
  rt.queueOfflineCalendarGeneration('A1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(confirmCalls, 2);
  assert.notEqual(rt.getLaunches()[0].planMeta && rt.getLaunches()[0].planMeta.autoGeneratedFromADN, true);
});

test('autogeneración offline pide confirmación, espera al Banco y llena solo días libres de un lanzamiento fechado', async () => {
  const rt = baseRuntime();
  rt.setReferencias([
    { id: 'custom-direct', title: 'Custom', cat: ['song promotion'], custom: true, energy: 'high' },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `public-${index}`,
      title: `Public ${index}`,
      cat: ['song promotion', 'performance', 'engagement'][index % 3],
      energy: ['high', 'medium', 'low'][index % 3],
    })),
  ]);
  rt.setArtists([{ id: 'A1', adn: { personality: { tone: 'Íntimo', archetypes: [] }, sound: {}, universe: {} } }]);
  rt.setLaunches([{
    id: 'L1', artistId: 'A1', date: '2026-10-01', preDays: 2, postDays: 2,
    cal: [{ id: 'human', source: 'manual', locked: true, fecha: '2026-09-30', refId: 'custom-direct', title: 'Elegida' }],
  }, {
    id: 'EVER', artistId: 'A1', type: 'evergreen', date: '2026-10-01', preDays: 2, postDays: 2, cal: [],
  }]);

  rt.setBankReady(false);
  assert.equal(rt.queueOfflineCalendarGeneration('A1'), 1);
  assert.equal(rt.getLaunches()[0].cal.length, 1);

  rt.setBankReady(true);
  // No hay generación hasta que el consentimiento asíncrono del guardado de ADN se resuelve.
  assert.equal(rt.flushOfflineCalendarGenerationQueue(), 0);
  await new Promise(resolve => setImmediate(resolve));
  const launch = rt.getLaunches()[0];
  assert.equal(launch.cal.filter(item => item.source === 'plan').length, 4);
  assert.ok(rt.calls.some(call => Array.isArray(call) && call[0] === 'confirm' && /recomendaciones base/i.test(call[1])));
  assert.equal(launch.cal.filter(item => item.fecha === '2026-09-30').length, 1);
  assert.equal(launch.planMeta.autoGeneratedFromADN, true);
  assert.equal(rt.getLaunches()[1].cal.length, 0);
  assert.ok(launch.cal.filter(item => item.source === 'plan').every(item => item.refId !== 'custom-direct' && !item.anchor && !item.anchorKey));
  assert.equal(rt.calls.includes('cloud-save'), false);
  assert.equal(rt.calls.includes('cloud-sync'), false);
});

test('rechazar la confirmación de ADN deja intacto el calendario', async () => {
  const rt = baseRuntime();
  let confirmCalls = 0;
  rt.setConfirm(async () => { confirmCalls += 1; return false; });
  rt.setBankReady(true);
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setArtists([{ id: 'A1', adn: { personality: { tone: 'Íntimo', archetypes: [] }, sound: {}, universe: {} } }]);
  rt.setLaunches([{ id: 'L1', artistId: 'A1', date: '2026-10-01', preDays: 1, postDays: 1,
    cal: [{ id: 'human', source: 'manual', locked: true, fecha: '2026-09-30', title: 'No tocar' }] }]);

  assert.equal(rt.queueOfflineCalendarGeneration('A1'), 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rt.getLaunches()[0].cal.length, 1);
  assert.equal(rt.getLaunches()[0].planMeta.autoGenerationDeclinedFromADN, true);
  assert.equal(rt.queueOfflineCalendarGeneration('A1'), 0);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(confirmCalls, 1);
});

test('bloqueo, desbloqueo y migración protegen acciones destructivas sin bloquear plan/template', async () => {
  const rt = baseRuntime();
  const legacy = rt.normalizeCalItem({ fecha: '2026-10-01', title: 'Legacy' }, 0);
  const plan = rt.normalizeCalItem({ id: 'p1', source: 'plan', fecha: '2026-10-02' }, 1);
  const template = rt.normalizeCalItem({ id: 't1', source: 'template', fecha: '2026-10-03' }, 2);

  assert.equal(legacy.source, 'manual');
  assert.equal(rt.calItemLocked(legacy), true);
  assert.equal(rt.calItemLocked(plan), false);
  assert.equal(rt.calItemLocked(template), false);

  rt.setLaunches([{ id: 'L1', cal: [legacy, plan, template] }]);
  assert.equal(await rt.deleteCalItem('L1', legacy.id), false);
  assert.equal(rt.replaceCalItem('L1', legacy.id, { title: 'Nuevo' }), false);
  assert.equal(rt.replaceCalItemWithAutomaticSuggestion('L1', legacy.id), false);

  let prevented = false;
  assert.equal(rt.calDragStart({ preventDefault: () => { prevented = true; }, dataTransfer: { setData() {} } }, 'L1', legacy.id), false);
  assert.equal(prevented, true);

  assert.equal(rt.toggleCalItemLock('L1', legacy.id, false), true);
  assert.equal(rt.calItemLocked(rt.getLaunches()[0].cal[0]), false);
  assert.equal(rt.replaceCalItem('L1', legacy.id, { title: 'Nuevo' }), true);
  assert.equal(rt.getLaunches()[0].cal[0].title, 'Nuevo');
  assert.ok(rt.calls.includes('local'));
  assert.ok(rt.calls.includes('cloud-sync'));
});

test('reemplazo automático conserva producción, excluye salientes y respeta permisos', () => {
  const rt = baseRuntime();
  rt.setReferencias([
    { id: 'old', title: 'Old', cat: ['performance'], energy: 'medium', link: 'https://example.com/old' },
    { id: 'used', title: 'Used', cat: ['reaction'], energy: 'medium', link: 'https://example.com/used' },
    { id: 'saliente', title: 'Saliente', cat: ['performance'], energy: 'medium', link: 'https://example.com/saliente' },
    { id: 'new-a', title: 'Nueva A', hook: 'Hook A', comentarios: 'Brief A', cat: ['reaction'], energy: 'medium', link: 'https://example.com/a' },
    { id: 'new-b', title: 'Nueva B', hook: 'Hook B', comentarios: 'Brief B', cat: ['performance'], energy: 'medium', link: 'https://example.com/b' },
  ]);
  const production = {
    objetivo: 'Guardar el hook',
    hook: 'Hook ya editado',
    descripcion: 'Brief ya editado',
    plataforma: 'TikTok 9:16',
    estado: 'grabando',
    responsable: 'Ana',
    guion: [{ time: '00:00', text: 'Abrir con coro' }],
    shots: [{ name: 'Primer plano', detail: 'Luz cálida' }],
    assets: [{ label: 'B-roll', link: 'drive://asset' }],
    content: { hook: 'Copy IA de la referencia anterior' },
  };
  rt.setLaunches([{
    id: 'L1',
    planMeta: { replacementExcludedRefIds: ['saliente'] },
    cal: [
      { id: 'target', source: 'plan', phase: 'post', offset: 4, fecha: '2026-10-05', date: '2026-10-05', pauta: 'pautado', refId: 'old', refIdx: 0, title: 'Vieja', production },
      { id: 'other', source: 'plan', phase: 'post', offset: 5, fecha: '2026-10-06', refId: 'used', title: 'Usada', production: { estado: 'pendiente' } },
    ],
  }]);

  assert.deepEqual(rt.planReplacementCandidates(rt.getLaunches()[0], rt.getLaunches()[0].cal[0]).map(item => item.id), ['new-a', 'new-b']);
  rt.setCanEdit(false);
  assert.equal(rt.replaceCalItemWithAutomaticSuggestion('L1', 'target'), false);
  assert.equal(rt.getLaunches()[0].cal[0].refId, 'old');

  rt.setCanEdit(true);
  assert.equal(rt.replaceCalItemWithAutomaticSuggestion('L1', 'target'), true);
  const item = rt.getLaunches()[0].cal[0];
  assert.equal(item.id, 'target');
  assert.equal(item.source, 'plan');
  assert.equal(item.fecha, '2026-10-05');
  assert.equal(item.pauta, 'pautado');
  assert.equal(item.phase, 'post');
  assert.equal(item.refId, 'new-a');
  assert.equal(item.refLink, 'https://example.com/a');
  const expectedProduction = Object.assign({}, production, { contentPrev: production.content });
  delete expectedProduction.content;
  assert.deepEqual(item.production, expectedProduction);
  assert.deepEqual(rt.getLaunches()[0].planMeta.replacementExcludedRefIds.sort(), ['old', 'saliente']);
});

test('el modal de producción expone control accesible de bloquear/desbloquear', () => {
  assert.match(APP_HTML, /id="prod-lock-toggle"/);
  assert.match(APP_HTML, /aria-pressed="false"/);
  assert.match(APP_HTML, /aria-label="Bloquear publicación"/);
  assert.match(APP_HTML, /onclick="toggleProductionLock\(\)"/);
});

test('una respuesta antigua de contenido IA no sobrescribe la regeneración más reciente', async () => {
  const rt = baseRuntime(`
    function aiReady() { return true; }
    function parseJSONObj(text) { return JSON.parse(text); }
    function friendlyError(error) { return String(error); }
    let _contentResolvers = [];
    async function callClaude() {
      return await new Promise(resolve => _contentResolvers.push(resolve));
    }
  `);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', cal: [{ id: 'P1', source: 'plan', fecha: '2026-10-01', production: {} }] }]);
  rt.setProdContext('L1', 'P1');
  const first = rt.generarContenidoIA();
  const second = rt.generarContenidoIA();
  rt.resolveContent(1, { text: JSON.stringify({ hook: 'Nuevo' }) });
  await second;
  rt.resolveContent(0, { text: JSON.stringify({ hook: 'Antiguo' }) });
  await first;

  assert.equal(rt.getLaunches()[0].cal[0].production.content.hook, 'Nuevo');
});

test('contenido IA pendiente no se aplica tras mover su pieza a otra campaña', async () => {
  const rt = baseRuntime(`
    function aiReady() { return true; }
    function parseJSONObj(text) { return JSON.parse(text); }
    function friendlyError(error) { return String(error); }
    let _contentResolvers = [];
    async function callClaude() { return await new Promise(resolve => _contentResolvers.push(resolve)); }
  `);
  rt.setLaunches([
    { id: 'L1', date: '2026-10-01', cal: [{ id: 'P1', source: 'plan', fecha: '2026-10-01', production: {} }] },
    { id: 'L2', date: '2026-10-02', cal: [] }
  ]);
  rt.setProdContext('L1', 'P1');
  const pending = rt.generarContenidoIA();
  rt.moveCalItem('L2');
  rt.resolveContent(0, { text: JSON.stringify({ hook: 'No debe aplicarse' }) });
  await pending;
  assert.equal(rt.getLaunches()[1].cal[0].production.content, undefined);
});

test('cambiar la recomendación invalida contenido IA pendiente de la pieza', async () => {
  const rt = baseRuntime(`
    function aiReady() { return true; }
    function parseJSONObj(text) { return JSON.parse(text); }
    function friendlyError(error) { return String(error); }
    let _contentResolvers = [];
    async function callClaude() { return await new Promise(resolve => _contentResolvers.push(resolve)); }
  `);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', cal: [{ id: 'P1', source: 'plan', fecha: '2026-10-01', refId: 'old', title: 'Anterior', production: {} }] }]);
  rt.setProdContext('L1', 'P1');
  const pending = rt.generarContenidoIA();
  rt.replaceCalItem('L1', 'P1', { refId: 'new', title: 'Nueva recomendación' });
  rt.resolveContent(0, { text: JSON.stringify({ hook: 'No debe aplicarse' }) });
  await pending;
  assert.equal(rt.getLaunches()[0].cal[0].production.content, undefined);
});

test('producción exige edit_launch para pauta, fecha, contenido y cambio de campaña', () => {
  const rt = baseRuntime();
  const item = { id: 'P1', source: 'plan', fecha: '2026-10-01', pauta: 'organico', title: 'Original', production: { hook: 'Inicio', guion: [], shots: [], assets: [] } };
  rt.setLaunches([{ id: 'L1', artistId: 'A1', cal: [item] }, { id: 'L2', artistId: 'A1', cal: [] }]);
  rt.setProdContext('L1', 'P1');
  rt.setCanEdit(false);

  rt.prodSet('hook', 'No permitido');
  rt.prodSetFecha('2026-10-02');
  rt.prodSetPauta('pautado');
  rt.moveCalItem('L2');

  const source = rt.getLaunches()[0].cal.find(candidate => candidate.id === 'P1');
  assert.equal(source && source.production.hook, 'Inicio');
  assert.equal(source && source.fecha, '2026-10-01');
  assert.equal(source && source.pauta, 'organico');
  assert.equal(rt.getLaunches()[0].cal.length, 1);
  assert.equal(rt.getLaunches()[1].cal.length, 0);
});

test('mover entre campañas invalida la asistencia pendiente del destino', () => {
  const rt = baseRuntime();
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  const moved = { id: 'P1', source: 'plan', fecha: '2026-10-01', pauta: 'organico', title: 'Mover', production: {} };
  rt.setLaunches([{ id: 'L1', artistId: 'A1', date: '2026-10-01', cal: [moved] }, { id: 'L2', artistId: 'A1', date: '2026-10-02', cal: [] }]);
  const target = rt.getLaunches()[1];
  rt.generateOfflineCalendarForLaunch('L2', { assist: false });
  const stalePiece = target.cal.find(item => item.source === 'plan');
  rt.setProdContext('L1', 'P1');
  rt.moveCalItem('L2');
  const stale = { mode: 'assisted', meta: {}, plan: { pieces: [{ id: stalePiece.id, fecha: stalePiece.fecha, title: 'IA', cat: stalePiece.cat, production: {} }] } };

  assert.equal(rt.applyAssistedCalendarPlan(target, stale, { generationVersion: 1, silent: true }), null);
  assert.equal(target.cal.some(item => item.id === 'P1'), true);
});

test('una edición de producción invalida la asistencia pendiente y preserva su pauta', () => {
  const rt = baseRuntime();
  rt.setReferencias([{ id: 'public-1', title: 'Pública', cat: ['song promotion'], energy: 'medium' }]);
  rt.setLaunches([{ id: 'L1', date: '2026-10-01', cal: [] }]);
  const target = rt.getLaunches()[0];
  rt.generateOfflineCalendarForLaunch('L1', { assist: false });
  const piece = target.cal.find(item => item.source === 'plan');
  rt.setProdContext('L1', piece.id);
  rt.prodSetPauta('pautado');
  const stale = { mode: 'assisted', meta: {}, plan: { pieces: [{ id: piece.id, fecha: piece.fecha, title: 'IA', cat: piece.cat, pauta: 'organico', production: {} }] } };

  assert.equal(rt.applyAssistedCalendarPlan(target, stale, { generationVersion: 1, silent: true }), null);
  assert.equal(rt.getLaunches()[0].cal.find(item => item.id === piece.id).pauta, 'pautado');
});

test('producción bloqueada conserva la publicación fija pero permite editar el brief', async () => {
  const rt = baseRuntime(`
    function aiReady() { return true; }
    const doc = {
      getElementById: (id) => id === 'prod-content-result'
        ? { innerHTML: '' }
        : { value: '', style: {}, classList: { add() {}, remove() {} } },
      querySelector: () => ({ value: '2026-10-01', style: {}, classList: { add() {}, remove() {} } }),
      querySelectorAll: () => [],
    };
  `);

  const locked = {
    id: 'LCK',
    title: 'Bloqueada',
    source: 'manual',
    locked: true,
    fecha: '2026-10-01',
    production: {
      estado: 'pendiente',
      responsable: 'Ana',
      guion: [{ time: '00:01', text: 'Guion 1', note: 'Nota' }],
      shots: [{ name: 'Plano 1', detail: 'Detalle' }],
      assets: [{ label: 'Asset 1', link: 'a.mp4' }],
      hook: 'Hook inicial',
      descripcion: 'Desc inicial',
    },
  };
  rt.setLaunches([{ id: 'L1', cal: [locked, { id: 'UNL', source: 'plan', fecha: '2026-10-02', production: { guion: [], shots: [], assets: [] } }] }]);

  const before = JSON.stringify(rt.getLaunches()[0].cal[0].production);
  rt.setProdContext('L1', 'LCK');
  rt.prodGuionAdd();
  rt.prodGuionSet(0, 'text', 'Editar bloqueado');
  rt.prodShotAdd();
  rt.prodShotSet(0, 'name', 'bloqueado');
  rt.prodAssetAdd();
  rt.prodAssetSet(0, 'label', 'bloqueado');
  rt.prodSet('title', 'Nuevo título');
  rt.prodSet('hook', 'Hook editado');

  assert.equal(rt.getLaunches()[0].cal[0].title, 'Bloqueada');
  assert.notEqual(JSON.stringify(rt.getLaunches()[0].cal[0].production), before);
  assert.equal(rt.getLaunches()[0].cal[0].production.guion.length, 2);
  assert.equal(rt.getLaunches()[0].cal[0].production.guion[0].text, 'Editar bloqueado');
  assert.equal(rt.getLaunches()[0].cal[0].production.shots.length, 2);
  assert.equal(rt.getLaunches()[0].cal[0].production.shots[0].name, 'bloqueado');
  assert.equal(rt.getLaunches()[0].cal[0].production.assets.length, 2);
  assert.equal(rt.getLaunches()[0].cal[0].production.assets[0].label, 'bloqueado');
  assert.equal(rt.getLaunches()[0].cal[0].production.hook, 'Hook editado');

  rt.setProdContext('L1', 'UNL');
  rt.prodSet('hook', 'Hook nuevo');
  rt.prodGuionAdd();
  rt.prodShotAdd();
  rt.prodAssetAdd();
  assert.equal(rt.getLaunches()[0].cal[1].production.guion.length, 1);
  assert.equal(rt.getLaunches()[0].cal[1].production.shots.length, 1);
  assert.equal(rt.getLaunches()[0].cal[1].production.assets.length, 1);
  assert.equal(rt.getLaunches()[0].cal[1].production.hook, 'Hook nuevo');
});

test('producción muestra explicación de recomendación, acción accesible y estado reservado', () => {
  const rt = baseRuntime();
  const replaceable = {
    id: 'PLAN',
    source: 'plan',
    phase: 'post',
    cat: 'reaction',
    recommendationReason: 'Sostener: reacción compatible con la fase.',
    production: { estado: 'pendiente' },
  };
  const locked = rt.lockCalItem({
    id: 'LCK',
    source: 'manual',
    cat: 'performance',
    production: { estado: 'pendiente' },
  }, 'manual');
  rt.setLaunches([{ id: 'L1', artistId: 'A1', name: 'Single', cal: [replaceable, locked] }]);
  rt.setProdContext('L1', 'PLAN');

  const replaceableHTML = rt.prodBriefHTML(replaceable, replaceable.production);
  assert.match(replaceableHTML, /Por qué se recomendó/);
  assert.match(replaceableHTML, /Sostener: reacción compatible/);
  assert.match(replaceableHTML, /aria-label="Reemplazar sugerencia automática"/);

  rt.setProdContext('L1', 'LCK');
  const lockedHTML = rt.prodBriefHTML(locked, locked.production);
  assert.match(lockedHTML, /Reservada/);
  assert.doesNotMatch(lockedHTML, /Reemplazar sugerencia automática/);
});

test('producción bloqueada mantiene habilitados briefing y campos permitidos, pero bloquea fecha', () => {
  const rt = baseRuntime();
  const locked = rt.lockCalItem({
    id: 'LCK',
    fecha: '2026-10-01',
    title: 'Bloqueada',
    source: 'manual',
    production: {
      estado: 'pendiente',
      objetivo: 'Objetivo viejo',
      hook: 'Hook viejo',
      descripcion: 'Descripción vieja',
      plataforma: 'TikTok',
      responsable: 'Ana',
      guion: [],
      shots: [],
      assets: [],
    },
  }, 'bloqueo manual');
  rt.setLaunches([{ id: 'L1', cal: [locked] }]);
  rt.setProdContext('L1', 'LCK');

  rt.prodSet('hook', 'Hook editado');
  rt.prodSet('estado', 'aprobado');
  rt.prodSet('responsable', 'Bruno');
  assert.equal(rt.getLaunches()[0].cal[0].production.hook, 'Hook editado');
  assert.equal(rt.getLaunches()[0].cal[0].production.estado, 'aprobado');
  assert.equal(rt.getLaunches()[0].cal[0].production.responsable, 'Bruno');

  rt.prodSetFecha('2026-10-03');
  assert.equal(rt.getLaunches()[0].cal[0].fecha, '2026-10-01');
});

test('modo elección del Banco muestra contexto y oculta acciones normales', () => {
  const rt = baseRuntime();
  rt.setArtists([{ id: 'A1', name: 'Artista' }]);
  rt.setReferencias([{ id: 'ref-1', title: 'Referencia A', cat: ['performance'], for: [], hook: '', link: '', icon: 'pin', _idx: 0 }]);
  rt.setLaunches([{ id: 'L1', artistId: 'A1', name: 'Single', cal: [{
    id: 'target',
    source: 'plan',
    title: 'Pieza vieja',
    fecha: '2026-10-05',
    phase: 'post',
    cat: 'performance',
    refId: 'old',
    production: { estado: 'pendiente' },
  }] }]);

  assert.equal(rt.beginBankChoiceReplacement('L1', 'target'), true);
  rt.renderBancoContext();
  rt.renderBancoToolbar();
  rt.renderBanco();

  assert.equal(rt.bankChoiceActive(), true);
  assert.match(rt.elements['ctx-banco'].innerHTML, /Eligiendo referencia/);
  assert.match(rt.elements['ctx-banco'].innerHTML, /Pieza vieja/);
  assert.match(rt.elements['ctx-banco'].innerHTML, /2026-10-05/);
  assert.match(rt.elements['ctx-banco'].innerHTML, /Cancelar/);
  assert.match(rt.elements['banco-toolbar'].innerHTML, /Banco en modo elección/);
  assert.doesNotMatch(rt.elements['banco-toolbar'].innerHTML, /Importar desde link/);
  assert.doesNotMatch(rt.elements['refs-grid'].innerHTML, /toggleIdea/);
  assert.doesNotMatch(rt.elements['refs-grid'].innerHTML, /crearPostDesdeCero/);
  assert.match(rt.elements['refs-grid'].innerHTML, /chooseBankReplacement\(0\)/);
});

test('elegir desde Banco reemplaza una pieza planificada, vuelve al contexto y cuenta uso humano una vez', () => {
  const rt = baseRuntime();
  rt.setArtists([{ id: 'A1', name: 'Artista' }]);
  rt.setReferencias([
    { id: 'old', title: 'Anterior', cat: ['performance'], for: [], energy: 'medium', link: 'https://example.com/old', _idx: 0 },
    { id: 'new', title: 'Nueva humana', cat: ['reaction'], for: ['vocalist/rapper'], energy: 'medium', hook: 'Hook banco', comentarios: 'Brief banco', link: 'https://example.com/new', _idx: 1 },
  ]);
  const production = {
    objetivo: 'Objetivo editado',
    hook: 'Hook editado',
    descripcion: 'Brief editado',
    plataforma: 'Reels',
    estado: 'grabando',
    responsable: 'Ana',
    guion: [{ text: 'Guion' }],
    shots: [{ name: 'Plano' }],
    assets: [{ label: 'Asset' }],
  };
  rt.setLaunches([{ id: 'L1', artistId: 'A1', name: 'Single', cal: [{
    id: 'target',
    planPieceId: 'target',
    source: 'plan',
    title: 'Pieza vieja',
    fecha: '2026-10-05',
    phase: 'post',
    offset: 4,
    cat: 'performance',
    refId: 'old',
    production,
  }] }]);

  assert.equal(rt.beginBankChoiceReplacement('L1', 'target', { page: 'calendario', calView: 'kanban', calRange: '2w', weekOffset: 3, monthOffset: 1 }), true);
  assert.equal(rt.chooseBankReplacement(1), true);

  const item = rt.getLaunches()[0].cal[0];
  assert.equal(item.id, 'target');
  assert.equal(item.planPieceId, 'target');
  assert.equal(item.fecha, '2026-10-05');
  assert.equal(item.phase, 'post');
  assert.equal(item.refId, 'new');
  assert.equal(item.refLink, 'https://example.com/new');
  assert.deepEqual(item.production, production);
  assert.equal(JSON.stringify(rt.getLaunches()[0].planMeta.replacementExcludedRefIds), JSON.stringify(['old']));
  assert.equal(rt.bankChoiceActive(), false);
  assert.ok(rt.calls.some(call => Array.isArray(call) && call[0] === 'usage' && call[1] === 'new'));
  assert.equal(rt.calls.filter(call => Array.isArray(call) && call[0] === 'usage' && call[1] === 'new').length, 1);
  assert.ok(rt.calls.includes('cloud-save'));
  assert.ok(rt.calls.includes('render-calendar'));
});

test('cancelar con Escape o al salir del Banco no cambia calendario ni uso', () => {
  const rt = baseRuntime();
  rt.setArtists([{ id: 'A1', name: 'Artista' }]);
  rt.setReferencias([{ id: 'new', title: 'Nueva humana', cat: ['performance'], for: [], energy: 'medium', _idx: 0 }]);
  rt.setLaunches([{ id: 'L1', artistId: 'A1', name: 'Single', cal: [{
    id: 'target', source: 'plan', title: 'Pieza vieja', fecha: '2026-10-05', phase: 'post', cat: 'performance', refId: 'old', production: { estado: 'pendiente' },
  }] }]);
  const before = JSON.stringify(rt.getLaunches()[0].cal);

  assert.equal(rt.beginBankChoiceReplacement('L1', 'target'), true);
  assert.equal(rt.cancelBankChoiceReplacement({ key: 'Enter' }), false);
  assert.equal(rt.bankChoiceActive(), true);
  assert.equal(rt.cancelBankChoiceReplacement({ key: 'Escape' }), true);
  assert.equal(rt.bankChoiceActive(), false);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), before);
  assert.equal(rt.calls.some(call => Array.isArray(call) && call[0] === 'usage'), false);

  assert.equal(rt.beginBankChoiceReplacement('L1', 'target'), true);
  rt.showPage('compas');
  assert.equal(rt.bankChoiceActive(), false);
  assert.equal(JSON.stringify(rt.getLaunches()[0].cal), before);
});

test('modo elección respeta permisos y bloqueo defensivo', () => {
  const rt = baseRuntime();
  rt.setArtists([{ id: 'A1', name: 'Artista' }]);
  rt.setReferencias([{ id: 'new', title: 'Nueva humana', cat: ['performance'], for: [], energy: 'medium', _idx: 0 }]);
  rt.setLaunches([{ id: 'L1', artistId: 'A1', name: 'Single', cal: [{
    id: 'target', source: 'plan', title: 'Pieza vieja', fecha: '2026-10-05', phase: 'post', cat: 'performance', refId: 'old', production: { estado: 'pendiente' },
  }, {
    id: 'locked', source: 'plan', locked: true, title: 'Bloqueada', fecha: '2026-10-06', phase: 'post', cat: 'performance', refId: 'locked-ref', production: { estado: 'pendiente' },
  }] }]);

  rt.setCanEdit(false);
  assert.equal(rt.beginBankChoiceReplacement('L1', 'target'), false);
  assert.equal(rt.bankChoiceActive(), false);

  rt.setCanEdit(true);
  assert.equal(rt.beginBankChoiceReplacement('L1', 'locked'), false);
  assert.equal(rt.bankChoiceActive(), false);

  assert.equal(rt.beginBankChoiceReplacement('L1', 'target'), true);
  rt.setCanEdit(false);
  assert.equal(rt.chooseBankReplacement(0), false);
  assert.equal(rt.getLaunches()[0].cal[0].refId, 'old');
  assert.equal(rt.bankChoiceActive(), true);
});

test('las vistas de producción y próximos escapan contenido persistido e IDs', () => {
  assert.match(APP, /value="\$\{esc\(p\.objetivo\)\}"/);
  assert.match(APP, />\$\{esc\(p\.descripcion\)\}<\/textarea>/);
  assert.match(APP, /value="\$\{esc\(b\.time\)\}"/);
  assert.match(APP, />\$\{esc\(sh\.detail\)\}<\/textarea>/);
  assert.match(APP, /onclick='openProduction\(\$\{jsArg\(ci\.launchId\)\},\$\{jsArg\(ci\.id\)\}\)'/);
  assert.doesNotMatch(APP, /onclick="openProduction\('\$\{ci\.launchId\}'/);
  assert.match(APP, /' · '\+esc\(r\.author\)/);
  assert.match(APP, /const v = \(value == null \|\| value === ''\) \? '—' : esc\(value\)/);
  assert.match(APP, /tags\.map\(h => `<span[^`]+>\$\{esc\(/);
  assert.match(APP, /contentResultPrevHTML[\s\S]+tags\.map\(h => `<span[^`]+>\$\{esc\(/);
});

test('exportación HTML aplica safeUrl a href/src y bloquea javascript:', () => {
  const prefix = fragment('// UTILS', '// ══════════════════════════════════════════\n// TRADUCCIÓN');
  const exportBlock = fragment('// EXPORTAR CALENDARIO', '// Crea un LINK de solo-lectura');
  const context = {
    activeLaunch: () => ({ name: 'Launch', date: '2026-10-01' }),
    activeArtist: () => ({ name: 'Artist' }),
    calVisibleItems: () => [{
      id: '\"><img src=x onerror=alert(9)>',
      title: 'Unsafe URLs',
      fecha: '2026-10-01',
      _campName: 'Main',
      cat: 'awareness',
      pauta: 'organico',
      thumb: 'javascript:alert(1)',
      refLink: 'javascript:alert(2)',
      production: {
        estado: 'pendiente',
        assets: [{ label: 'Bad asset', link: 'javascript:alert(3)' }],
      },
    }],
    refThumbImmediate: () => '',
  };
  const runtime = vm.runInNewContext(`
${prefix}
const MESES_CAL = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
${exportBlock}
({ buildCalDoc });
`, context);
  const html = runtime.buildCalDoc(false);

  assert.doesNotMatch(html, /href=["']javascript:/i);
  assert.doesNotMatch(html, /src=["']javascript:/i);
  assert.match(html, /href="#"/);
  assert.match(html, /src="#"/);
  assert.doesNotMatch(html, /onerror=alert\(9\)/);
  assert.match(html, /id="p-0"/);
  assert.match(html, /onclick="op\(0\)"/);
});
