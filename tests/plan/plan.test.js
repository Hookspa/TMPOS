const test = require('node:test');
const assert = require('node:assert/strict');

const TempoPlan = require('../../js/plan.js');

const {
  ANCHORS,
  arrangePlanWithAI,
  buildPlan,
  calcUsage,
  filterRefs,
  makeFreeDaySlots,
  makeSlots,
  recommendationReason,
  replacementCandidates,
  replacePieceReference,
  validateAI,
} = TempoPlan;

function ref(id, cat, extra) {
  return {
    id,
    title: `Referencia ${id}`,
    hook: `Hook ${id}`,
    cat: Array.isArray(cat) ? cat : [cat],
    link: `https://example.com/${id}`,
    ...extra,
  };
}

function refs(count) {
  const cats = [
    'awareness',
    'behind the scenes',
    'storytelling',
    'song promotion',
    'transition hook',
    'vibes',
    'engagement',
    'performance',
    'show your skills / challenge',
    'talking to camera',
    'reaction',
    'relatable',
    'trending sounds',
  ];
  return Array.from({ length: count }, (_, index) => ref(`ref-${String(index + 1).padStart(2, '0')}`, cats[index % cats.length], {
    energy: index % 3 === 0 ? 'high' : (index % 3 === 1 ? 'medium' : 'low'),
  }));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compactCatalog(catalog) {
  const seen = new Set();
  const out = [];
  catalog.forEach((item, index) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ ...item, _idx: index });
  });
  return out;
}

function compactIndexes(catalog) {
  return new Map(compactCatalog(catalog).map((item, index) => [item.id, index]));
}

test('makeSlots genera 43 días y 44 slots desde -21 hasta +21', () => {
  const slots = makeSlots({ date: '2026-10-01' });
  const uniqueOffsets = new Set(slots.map(slot => slot.offset));

  assert.equal(slots.length, 44);
  assert.equal(uniqueOffsets.size, 43);
  assert.equal(Math.min(...uniqueOffsets), -21);
  assert.equal(Math.max(...uniqueOffsets), 21);
  assert.equal(slots.filter(slot => slot.offset === 0).length, 2);
  assert.equal(slots[0].fecha, '2026-09-10');
  assert.equal(slots[slots.length - 1].fecha, '2026-10-22');
});

test('makeFreeDaySlots respeta pre/post variables, máximo 44 y no crea anclas automáticas', () => {
  const slots = makeFreeDaySlots({ date: '2026-10-01', preDays: 2, postDays: 3 }, 44);

  assert.equal(slots.length, 6);
  assert.deepEqual(slots.map(slot => slot.offset), [-2, -1, 0, 1, 2, 3]);
  assert.equal(slots.filter(slot => slot.offset === 0).length, 1);
  assert.equal(slots.some(slot => slot.anchor), false);
  assert.equal(slots.some(slot => slot.key === 'available-now' || slot.key === 'chorus-performance'), false);

  const capped = makeFreeDaySlots({ date: '2026-10-01', preDays: 50, postDays: 50 }, 99);
  assert.equal(capped.length, 44);
});

test('freeDaysOnly genera una recomendación por fecha libre y salta bloqueadas sin gastar el máximo', () => {
  const lockedDates = new Set(['2026-09-29', '2026-10-01']);
  const slots = makeFreeDaySlots({ date: '2026-10-01', preDays: 2, postDays: 3 }, 44, lockedDates);

  assert.deepEqual(slots.map(slot => slot.fecha), ['2026-09-30', '2026-10-02', '2026-10-03', '2026-10-04']);

  const occupied = new Set();
  for (let offset = -50; offset < -20; offset += 1) {
    const d = new Date('2026-10-01T00:00:00');
    d.setDate(d.getDate() + offset);
    occupied.add(d.toISOString().slice(0, 10));
  }
  const cappedAfterOccupied = makeFreeDaySlots({ date: '2026-10-01', preDays: 50, postDays: 50 }, 44, occupied);
  assert.equal(cappedAfterOccupied.length, 44);
  assert.equal(cappedAfterOccupied[0].offset, -20);
});

test('la API pública TempoPlan no permite reemplazar ANCHORS ni métodos exportados', () => {
  const originalAnchors = TempoPlan.ANCHORS;
  const originalBuildPlan = TempoPlan.buildPlan;
  function replaceAnchors() {
    'use strict';
    TempoPlan.ANCHORS = [];
  }
  function replaceBuildPlan() {
    'use strict';
    TempoPlan.buildPlan = () => ({});
  }

  assert.equal(Object.isFrozen(TempoPlan), true);
  assert.throws(replaceAnchors, TypeError);
  assert.throws(replaceBuildPlan, TypeError);
  assert.equal(TempoPlan.ANCHORS, originalAnchors);
  assert.equal(TempoPlan.buildPlan, originalBuildPlan);
  assert.equal(makeSlots({ date: '2026-10-01' }).some(slot => slot.key === 'cover-reveal'), true);
});

test('la inmutabilidad pública congela también objetos función exportados', () => {
  const originalCall = TempoPlan.buildPlan.call;
  function addFunctionProperty() {
    'use strict';
    TempoPlan.buildPlan.extraObservableState = true;
  }
  function replaceFunctionMethod() {
    'use strict';
    TempoPlan.buildPlan.call = () => ({});
  }

  assert.equal(Object.isFrozen(TempoPlan.buildPlan), true);
  assert.equal(Object.isFrozen(TempoPlan.validateAI), true);
  assert.throws(addFunctionProperty, TypeError);
  assert.throws(replaceFunctionMethod, TypeError);
  assert.equal(TempoPlan.buildPlan.extraObservableState, undefined);
  assert.equal(TempoPlan.buildPlan.call, originalCall);
});

test('ANCHORS está inmovilizado en profundidad y makeSlots copia categorías anidadas', () => {
  assert.equal(Object.isFrozen(ANCHORS), true);
  assert.equal(Object.isFrozen(ANCHORS[0]), true);
  assert.equal(Object.isFrozen(ANCHORS[0].categories), true);
  assert.throws(() => ANCHORS[0].categories.push('mutacion'), TypeError);

  const slots = makeSlots({ date: '2026-10-01' });
  const coverSlot = slots.find(slot => slot.anchorKey === undefined && slot.key === 'cover-reveal');
  coverSlot.categories.push('solo-slot');

  assert.equal(ANCHORS[0].categories.includes('solo-slot'), false);
});

test('buildPlan conserva refIdx canónico y se valida con catálogos de entrada duplicados', () => {
  const catalog = [
    ref('dup', 'awareness', { energy: 'high' }),
    ref('dup', 'performance', { energy: 'high', title: 'Duplicado descartado' }),
    ...refs(70),
  ];
  const compactIdx = compactIndexes(catalog);
  const launch = buildPlan({ id: 'L-dup', date: '2026-08-10' }, catalog);
  const shiftedPiece = launch.plan.pieces.find(piece => (
    piece.refId && compactIdx.has(piece.refId) && piece.refIdx !== compactIdx.get(piece.refId)
  ));

  assert.ok(shiftedPiece);
  assert.equal(catalog[shiftedPiece.refIdx].id, shiftedPiece.refId);
  assert.equal(validateAI(launch, catalog, { expectCompletePlan: true }).ok, true);

  const broken = clone(launch);
  const brokenIndex = launch.plan.pieces.indexOf(shiftedPiece);
  broken.plan.pieces[brokenIndex].refIdx = compactIdx.get(shiftedPiece.refId);
  const result = validateAI(broken, catalog, { expectCompletePlan: true });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => (
    (error.code === 'INVALID_REF_IDX' || error.code === 'REF_MISMATCH') && error.index === brokenIndex
  )));
});

test('validateAI acepta catálogos legacy ya normalizados con refIdx canónico o compacto', () => {
  const catalog = [
    ref('dup', 'awareness', { energy: 'high' }),
    ref('dup', 'performance', { energy: 'high', title: 'Duplicado descartado' }),
    ...refs(70),
  ];
  const normalizedCatalog = compactCatalog(catalog);
  const compactIdx = compactIndexes(catalog);
  const launch = buildPlan({ id: 'L-normalized', date: '2026-08-10' }, catalog);
  const compactLaunch = clone(launch);
  compactLaunch.plan.pieces.forEach(piece => {
    if (piece.refId) piece.refIdx = compactIdx.get(piece.refId);
  });

  assert.equal(validateAI(launch, normalizedCatalog, { expectCompletePlan: true }).ok, true);
  assert.equal(validateAI(compactLaunch, normalizedCatalog, { expectCompletePlan: true }).ok, true);
});

test('las fechas ISO inexistentes no hacen rollover y validateAI las rechaza', () => {
  const invalidSlots = makeSlots({ date: '2026-02-30' });
  assert.equal(invalidSlots[0].fecha, '');

  const catalog = refs(70);
  const launch = buildPlan({ id: 'L-date', date: '2026-03-15' }, catalog);
  launch.plan.pieces[0] = { ...launch.plan.pieces[0], fecha: '2026-02-30', date: '2026-02-30' };
  const result = validateAI(launch, catalog, { expectCompletePlan: true });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'INVALID_DATE' && error.date === '2026-02-30'));
});

test('buildPlan crea contrato l.plan con 43 días, 44 piezas y anclas correctas', () => {
  const launch = buildPlan({ id: 'L-test', name: 'Single', date: '2026-10-01' }, refs(80));

  assert.equal(launch.plan.range.days, 43);
  assert.equal(launch.plan.range.pieces, 44);
  assert.equal(launch.plan.days.length, 43);
  assert.equal(launch.plan.pieces.length, 44);
  assert.equal(launch.plan.pieces.filter(piece => piece.source === 'plan').length, 44);

  const anchors = launch.plan.pieces.filter(piece => piece.anchor);
  assert.deepEqual(anchors.map(piece => [piece.title, piece.offset, piece.fecha]), [
    ['Cover reveal', -21, '2026-09-10'],
    ['Ya disponible', 0, '2026-10-01'],
    ['Performance del coro', 0, '2026-10-01'],
  ]);
  assert.ok(launch.plan.pieces.every(piece => typeof piece.refId === 'string'));
  assert.ok(launch.plan.pieces.every(piece => Number.isInteger(piece.refIdx)));
});

test('buildPlan en freeDaysOnly no crea anclas, respeta fechas bloqueadas y usa solo referencias recomendables', () => {
  const launch = buildPlan({
    id: 'L-free',
    name: 'Free days',
    date: '2026-10-01',
    preDays: 2,
    postDays: 3,
    cal: [
      { id: 'human-custom', fecha: '2026-09-29', title: 'Elegida por persona', locked: true, refId: 'custom-1' },
      { id: 'plan-replaceable', fecha: '2026-09-30', title: 'Plan viejo', source: 'plan' },
    ],
  }, [
    ref('custom-1', 'song promotion', { custom: true, energy: 'high' }),
    ref('owned-1', 'performance', { owned: true, energy: 'medium' }),
    ref('community-1', 'engagement', { community: true, energy: 'low' }),
    ...refs(20),
  ], {
    freeDaysOnly: true,
    maxPieces: 44,
  });

  assert.equal(launch.plan.range.freeDaysOnly, true);
  assert.equal(launch.plan.pieces.length, 4);
  assert.equal(launch.plan.pieces.some(piece => piece.fecha === '2026-09-29'), false);
  assert.equal(launch.plan.pieces.some(piece => piece.fecha === '2026-09-30'), false);
  assert.equal(launch.plan.pieces.filter(piece => piece.offset === 0).length, 1);
  assert.equal(launch.plan.pieces.some(piece => piece.anchor || piece.anchorKey), false);
  assert.ok(launch.plan.pieces.every(piece => !['custom-1', 'owned-1', 'community-1'].includes(piece.refId)));
});

test('filterRefs excluye refs custom, owned y community salvo opt-out explícito', () => {
  const candidates = [
    ref('custom-a', 'performance', { custom: true, energy: 'high' }),
    ref('owned-a', 'performance', { owned: true, energy: 'high' }),
    ref('community-a', 'performance', { community: true, energy: 'high' }),
    ref('community-owned-false', 'performance', { owned: false, energy: 'high' }),
    ref('public-a', 'performance', { energy: 'high' }),
  ];

  assert.deepEqual(
    filterRefs(candidates, { category: 'performance', energy: 'high' }).map(item => item.id),
    ['public-a'],
  );
  assert.deepEqual(
    filterRefs(candidates, { category: 'performance', energy: 'high', excludeCustom: false }).map(item => item.id).sort(),
    ['community-a', 'community-owned-false', 'custom-a', 'owned-a', 'public-a'],
  );
});

test('filterRefs aplica categoría, hook/energía, evergreen, IDs excluidos y uso previo', () => {
  const candidates = [
    ref('used', 'performance', { energy: 'high' }),
    ref('blocked', 'performance', { energy: 'high' }),
    ref('ever', 'performance', { energy: 'high', evergreen: true }),
    ref('wrong-energy', 'performance', { energy: 'low' }),
    ref('ok', 'performance', { energy: 'high', hook: 'coro potente' }),
  ];

  const result = filterRefs(candidates, {
    category: 'performance',
    hook: 'coro',
    energy: 'high',
    excludeIds: ['blocked'],
    previousUsage: { used: 2 },
    excludePreviousUsage: true,
  });

  assert.deepEqual(result.map(item => item.id), ['ok']);
});

test('buildPlan conserva 44 piezas y evita duplicados cuando faltan candidatas', () => {
  const launch = buildPlan({ id: 'L-short', date: '2026-11-15' }, [
    ref('only-a', 'performance', { energy: 'high' }),
    ref('only-b', 'storytelling', { energy: 'low' }),
  ]);
  const usedRefIds = launch.plan.pieces.map(piece => piece.refId).filter(Boolean);

  assert.equal(launch.plan.pieces.length, 44);
  assert.equal(new Set(usedRefIds).size, usedRefIds.length);
  assert.equal(usedRefIds.length, 2);
  assert.equal(launch.plan.meta.fallbackCount, 42);
  assert.equal(launch.plan.pieces.filter(piece => piece.fallback).length, 42);
});

test('validateAI acepta plan completo de buildPlan con fallback sin aceptar piezas normales sin ref', () => {
  const shortCatalog = [
    ref('only-a', 'performance', { energy: 'high' }),
    ref('only-b', 'storytelling', { energy: 'low' }),
  ];
  const fallbackLaunch = buildPlan({ id: 'L-short-valid', date: '2026-11-15' }, shortCatalog);
  const fallbackResult = validateAI(fallbackLaunch, shortCatalog);

  assert.equal(fallbackResult.ok, true);
  assert.equal(fallbackLaunch.plan.pieces.filter(piece => piece.fallback).length, 42);

  const fullCatalog = refs(70);
  const normalMissingRef = buildPlan({ id: 'L-normal-missing-ref', date: '2026-11-15' }, fullCatalog);
  normalMissingRef.plan.pieces[0] = {
    ...normalMissingRef.plan.pieces[0],
    fallback: false,
    refId: '',
    refIdx: -1,
  };
  const missingResult = validateAI(normalMissingRef, fullCatalog);

  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.some(error => error.code === 'MISSING_REF_ID' && error.index === 0));
});

test('buildPlan distribuye por fases sin duplicar referencias', () => {
  const launch = buildPlan({ id: 'L-phases', date: '2026-12-01' }, refs(90));
  const phaseCounts = launch.plan.pieces.reduce((acc, piece) => {
    acc[piece.phase] = (acc[piece.phase] || 0) + 1;
    return acc;
  }, {});
  const usedRefIds = launch.plan.pieces.map(piece => piece.refId).filter(Boolean);

  assert.deepEqual(phaseCounts, { pre: 21, launch: 2, post: 21 });
  assert.equal(new Set(usedRefIds).size, usedRefIds.length);
  assert.equal(launch.plan.days.find(day => day.offset === 0).pieceIds.length, 2);
});

test('las referencias se seleccionan por ID estable y no por orden del arreglo', () => {
  const originalRefs = refs(60);
  const reversedRefs = originalRefs.slice().reverse();
  const first = buildPlan({ id: 'L-stable', date: '2026-10-01' }, originalRefs);
  const second = buildPlan({ id: 'L-stable', date: '2026-10-01' }, reversedRefs);

  assert.deepEqual(
    first.plan.pieces.map(piece => piece.id),
    second.plan.pieces.map(piece => piece.id),
  );
  assert.deepEqual(
    first.plan.pieces.map(piece => piece.refId),
    second.plan.pieces.map(piece => piece.refId),
  );
  second.plan.pieces.filter(piece => piece.refId).forEach(piece => {
    assert.equal(reversedRefs[piece.refIdx].id, piece.refId);
  });
});

test('normaliza plan legacy sin destruir campos ni contenido previo', () => {
  const launch = buildPlan({
    id: 'L-legacy',
    date: '2026-09-20',
    plan: {
      reviewerNote: 'mantener',
      items: [{ titulo: 'Idea vieja', date: '2026-09-01', ref_idx: 1, extra: { keep: true } }],
    },
  }, [ref('a', 'awareness'), ref('b', 'performance')]);

  assert.equal(launch.plan.reviewerNote, 'mantener');
  assert.equal(launch.plan.legacyPieces.length, 1);
  assert.equal(launch.plan.legacyPieces[0].title, 'Idea vieja');
  assert.equal(launch.plan.legacyPieces[0].refId, 'b');
  assert.deepEqual(launch.plan.legacyPieces[0].extra, { keep: true });
  assert.equal(launch.plan.meta.legacyPieceCount, 1);
});

test('validateAI acepta el contrato completo y detecta duplicados o refs desconocidas', () => {
  const catalog = refs(70);
  const launch = buildPlan({ id: 'L-ai', date: '2026-08-10' }, catalog);
  const valid = validateAI(launch, catalog);

  assert.equal(valid.ok, true);
  assert.equal(valid.pieces.length, 44);

  const broken = {
    plan: {
      pieces: [
        { id: 'p1', title: 'Uno', offset: -21, refId: 'missing' },
        { id: 'p2', title: 'Dos', offset: -20, refId: 'missing' },
      ],
    },
  };
  const invalid = validateAI(broken, catalog);

  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some(error => error.code === 'UNKNOWN_REF_ID'));
  assert.ok(invalid.errors.some(error => error.code === 'DUPLICATE_REF_ID'));
});

test('validateAI exige por defecto el contrato completo y solo allowPartialPlan habilita parcial', () => {
  const catalog = refs(70);
  const launch = buildPlan({ id: 'L-complete-default', date: '2026-08-10' }, catalog);
  const partial = { plan: { pieces: [launch.plan.pieces.find(piece => !piece.anchor)] } };
  const defaultResult = validateAI(partial, catalog);
  const partialResult = validateAI(partial, catalog, { allowPartialPlan: true });

  assert.equal(defaultResult.ok, false);
  assert.ok(defaultResult.errors.some(error => error.code === 'INVALID_PIECE_COUNT' && error.actual === 1));
  assert.ok(defaultResult.errors.some(error => error.code === 'INVALID_DAY_COUNT'));
  assert.equal(partialResult.ok, true);
});

test('validateAI exige identidad estructural de anclas, no solo título y offset', () => {
  const catalog = refs(70);
  const launch = buildPlan({ id: 'L-anchor-identity', date: '2026-08-10' }, catalog);
  const coverIndex = launch.plan.pieces.findIndex(piece => piece.anchorKey === 'cover-reveal');
  launch.plan.pieces[coverIndex] = {
    ...launch.plan.pieces[coverIndex],
    anchor: false,
    anchorKey: '',
    title: 'Cover reveal',
    offset: -21,
  };
  const result = validateAI(launch, catalog);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MISSING_ANCHOR' && error.anchor === 'cover-reveal'));
});

test('validateAI exige source plan sin normalizar fuentes inválidas', () => {
  const catalog = refs(70);
  const launch = buildPlan({ id: 'L-source', date: '2026-08-10' }, catalog);
  launch.plan.pieces[0] = { ...launch.plan.pieces[0], source: 'ia' };
  const result = validateAI(launch, catalog, { expectCompletePlan: true });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'INVALID_SOURCE' && error.source === 'ia'));
});

test('validateAI exige refId y refIdx presentes y coherentes sin usar aliases legacy', () => {
  const catalog = refs(70);
  const launch = buildPlan({ id: 'L-refs', date: '2026-08-10' }, catalog);
  const missingRefId = { ...launch.plan.pieces[0] };
  delete missingRefId.refId;
  const missingRefIdx = { ...launch.plan.pieces[1] };
  delete missingRefIdx.refIdx;
  const legacyAliasOnly = { ...launch.plan.pieces[2], ref_idx: launch.plan.pieces[2].refIdx };
  delete legacyAliasOnly.refIdx;
  const mismatchedRef = { ...launch.plan.pieces[3], refIdx: launch.plan.pieces[4].refIdx };
  launch.plan.pieces[0] = missingRefId;
  launch.plan.pieces[1] = missingRefIdx;
  launch.plan.pieces[2] = legacyAliasOnly;
  launch.plan.pieces[3] = mismatchedRef;
  const result = validateAI(launch, catalog, { expectCompletePlan: true });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'MISSING_REF_ID' && error.index === 0));
  assert.ok(result.errors.some(error => error.code === 'INVALID_REF_IDX' && error.index === 1));
  assert.ok(result.errors.some(error => error.code === 'INVALID_REF_IDX' && error.index === 2));
  assert.ok(result.errors.some(error => error.code === 'REF_MISMATCH' && error.index === 3));
});

test('validateAI exige offsets enteros en rango y conjunto completo exacto', () => {
  const catalog = refs(70);
  const nonInteger = buildPlan({ id: 'L-offset-type', date: '2026-08-10' }, catalog);
  nonInteger.plan.pieces[0] = { ...nonInteger.plan.pieces[0], offset: '-21' };
  const nonIntegerResult = validateAI(nonInteger, catalog, { expectCompletePlan: true });
  assert.equal(nonIntegerResult.ok, false);
  assert.ok(nonIntegerResult.errors.some(error => error.code === 'INVALID_OFFSET' && error.index === 0));

  const outOfRange = buildPlan({ id: 'L-offset-range', date: '2026-08-10' }, catalog);
  outOfRange.plan.pieces[0] = { ...outOfRange.plan.pieces[0], offset: 22 };
  const outOfRangeResult = validateAI(outOfRange, catalog, { expectCompletePlan: true });
  assert.equal(outOfRangeResult.ok, false);
  assert.ok(outOfRangeResult.errors.some(error => error.code === 'OFFSET_OUT_OF_RANGE' && error.offset === 22));

  const incomplete = buildPlan({ id: 'L-offset-set', date: '2026-08-10' }, catalog);
  incomplete.plan.pieces.find(piece => piece.offset === -20).offset = -19;
  const incompleteResult = validateAI(incomplete, catalog, { expectCompletePlan: true });
  assert.equal(incompleteResult.ok, false);
  assert.ok(incompleteResult.errors.some(error => error.code === 'INVALID_OFFSET_COUNT' && error.offset === -20 && error.actual === 0));
  assert.ok(incompleteResult.errors.some(error => error.code === 'INVALID_OFFSET_COUNT' && error.offset === -19 && error.actual === 2));
});

test('calcUsage cuenta piezas planificadas por refId sin usar claves legacy', () => {
  assert.deepEqual(calcUsage([
    { source: 'plan', refId: 'a' },
    { source: 'plan', refId: 'a' },
    { source: 'plan', refId: 'b' },
    { source: 'plan', refId: '' },
  ]), { a: 2, b: 1 });
});

test('replacementCandidates propone candidatas de la fase y excluye refs usadas o salientes', () => {
  const launch = {
    id: 'L-replace-candidates',
    planMeta: { replacementExcludedRefIds: ['saliente'] },
    cal: [
      { id: 'target', source: 'plan', phase: 'post', offset: 4, refId: 'actual', cats: ['performance'] },
      { id: 'used', source: 'plan', phase: 'post', offset: 5, refId: 'ya-usada', cats: ['reaction'] },
    ],
  };
  const candidates = replacementCandidates(launch, [
    ref('actual', 'performance', { energy: 'medium' }),
    ref('ya-usada', 'reaction', { energy: 'medium' }),
    ref('saliente', 'performance', { energy: 'medium' }),
    ref('pre-only', 'awareness', { energy: 'medium' }),
    ref('post-ok', 'reaction', { energy: 'medium' }),
    ref('post-alt', 'performance', { energy: 'medium' }),
  ], 'target');

  assert.deepEqual(candidates.map(item => item.id), ['post-alt', 'post-ok']);
  assert.ok(candidates.every(item => ['reaction', 'performance'].includes(item.cat[0])));

  const noPhaseMatch = replacementCandidates(launch, [
    ref('pre-only', 'awareness', { energy: 'medium' }),
    ref('launch-only', 'song promotion', { energy: 'high' }),
  ], 'target');
  assert.deepEqual(noPhaseMatch, []);
});

test('replacePieceReference cambia solo la referencia y conserva identidad, fecha y producción', () => {
  const original = {
    id: 'plan-L1-4-post-4',
    planPieceId: 'plan-L1-4-post-4',
    source: 'plan',
    title: 'Referencia anterior',
    phase: 'post',
    offset: 4,
    day: 4,
    fecha: '2026-10-05',
    date: '2026-10-05',
    pauta: 'pautado',
    refId: 'old',
    refIdx: 0,
    refLink: 'https://example.com/old',
    production: {
      objetivo: 'Convertir comentarios en saves',
      hook: 'Hook editado por el equipo',
      descripcion: 'Brief editado',
      plataforma: 'Reels 9:16',
      estado: 'grabando',
      responsable: 'Ana',
      guion: [{ time: '00:00', text: 'Abrir con coro' }],
      shots: [{ name: 'Plano detalle', detail: 'Manos' }],
      assets: [{ label: 'B-roll', link: 'drive://asset' }],
    },
  };
  const updated = replacePieceReference(original, ref('new', 'reaction', {
    _idx: 7,
    title: 'Referencia nueva',
    hook: 'Hook nuevo de banco',
    comentarios: 'Descripción nueva',
    link: 'https://example.com/new',
    thumb: 'https://example.com/thumb.jpg',
  }));

  assert.equal(updated.id, original.id);
  assert.equal(updated.planPieceId, original.planPieceId);
  assert.equal(updated.source, 'plan');
  assert.equal(updated.fecha, original.fecha);
  assert.equal(updated.date, original.date);
  assert.equal(updated.phase, original.phase);
  assert.equal(updated.pauta, original.pauta);
  assert.equal(updated.title, 'Referencia nueva');
  assert.equal(updated.refId, 'new');
  assert.equal(updated.refIdx, 7);
  assert.equal(updated.refLink, 'https://example.com/new');
  assert.deepEqual(updated.production, original.production);
  assert.match(updated.recommendationReason, /Sostener/);
  assert.match(recommendationReason(updated), /Reacción/);
});

test('la IA solo reordena candidatas validadas y el motor completa respuestas parciales sin exponer detalles del proveedor', async () => {
  const catalog = refs(70);
  const launch = { id: 'L-assisted', date: '2026-10-01' };
  const offline = buildPlan(launch, catalog);
  const candidates = offline.plan.pieces.filter(piece => piece.refId);
  const first = candidates[0];
  const second = candidates[1];
  const result = await arrangePlanWithAI(launch, catalog, {
    permission: true,
    configured: true,
    quota: true,
    request: async request => ({ selections: [
      { pieceId: first.id, refId: second.refId, reason: 'Alterna el formato para abrir la campaña.' },
      { pieceId: second.id, refId: first.refId, reason: 'Cierra el intercambio sin repetir referencias.' },
      { pieceId: candidates[2].id, refId: 'referencia-inventada', reason: 'No debe aceptarse.' },
      { pieceId: 'slot-inventado', refId: first.refId, reason: 'No debe aceptarse.' },
    ], provider: 'never-persisted', cost: 9.99 }),
  });

  const replaced = result.plan.pieces.find(piece => piece.id === first.id);
  const completed = result.plan.pieces.find(piece => piece.id === second.id);
  assert.equal(result.mode, 'assisted');
  assert.equal(result.plan.pieces.length, 44);
  assert.equal(replaced.refId, second.refId);
  assert.equal(completed.refId, first.refId);
  assert.equal(replaced.production.hook, catalog.find(reference => reference.id === second.refId).hook);
  assert.equal(completed.production.hook, catalog.find(reference => reference.id === first.refId).hook);
  assert.equal(result.meta.provider, undefined);
  assert.equal(result.meta.cost, undefined);
  assert.match(replaced.recommendationReason, /Alterna el formato/);
  assert.ok(result.validation.errors.some(error => error.code === 'UNKNOWN_CANDIDATE_REF'));
  assert.ok(result.validation.errors.some(error => error.code === 'UNKNOWN_SLOT'));
});

test('permiso, cuota, configuración, fallo y timeout devuelven el mismo plan offline sin contar uso', async () => {
  const catalog = refs(70);
  const launch = { id: 'L-offline-fallback', date: '2026-10-01' };
  const baseline = buildPlan(launch, catalog);
  const blocked = await Promise.all([
    arrangePlanWithAI(launch, catalog, { permission: false, configured: true, quota: true }),
    arrangePlanWithAI(launch, catalog, { permission: true, configured: false, quota: true }),
    arrangePlanWithAI(launch, catalog, { permission: true, configured: true, quota: false }),
    arrangePlanWithAI(launch, catalog, { permission: true, configured: true, quota: true, request: async () => { throw new Error('provider down'); } }),
    arrangePlanWithAI(launch, catalog, { permission: true, configured: true, quota: true, timeoutMs: 1, request: () => new Promise(() => {}) }),
  ]);

  assert.deepEqual(blocked.map(result => result.mode), ['offline', 'offline', 'offline', 'offline', 'offline']);
  assert.deepEqual(blocked.map(result => result.plan.pieces.map(piece => piece.refId)), blocked.map(() => baseline.plan.pieces.map(piece => piece.refId)));
  assert.deepEqual(blocked.map(result => result.meta.aiUsageCount), [0, 0, 0, 0, 0]);
  assert.deepEqual(blocked.map(result => result.meta.reason), ['permission', 'configuration', 'quota', 'provider_failure', 'timeout']);
});
