(function exposePlan(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.TempoPlan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPlanApi() {
  const DAY_START = -21;
  const DAY_END = 21;
  const PLAN_DAY_COUNT = 43;
  const PLAN_PIECE_COUNT = 44;
  const MAX_FREE_DAY_PIECES = 44;
  const PLAN_VERSION = 1;
  const ENERGY = ['low', 'medium', 'high'];

  function deepFreeze(value, seen) {
    const type = typeof value;
    if (!value || (type !== 'object' && type !== 'function') || Object.isFrozen(value)) return value;
    const visited = seen || new WeakSet();
    if (visited.has(value)) return value;
    visited.add(value);
    Object.getOwnPropertyNames(value).forEach(key => {
      let child;
      try { child = value[key]; } catch (_error) { return; }
      deepFreeze(child, visited);
    });
    return Object.freeze(value);
  }

  const ANCHORS = deepFreeze([
    { key: 'cover-reveal', title: 'Cover reveal', offset: -21, phase: 'pre', cat: 'awareness', categories: ['cover', 'awareness', 'behind the scenes', 'song promotion'] },
    { key: 'available-now', title: 'Ya disponible', offset: 0, phase: 'launch', cat: 'song promotion', categories: ['song promotion', 'performance', 'engagement', 'talking to camera'] },
    { key: 'chorus-performance', title: 'Performance del coro', offset: 0, phase: 'launch', cat: 'performance', categories: ['performance', 'show your skills / challenge', 'talking to camera', 'song promotion'] },
  ]);
  const PHASE_CATEGORIES = deepFreeze({
    pre: ['awareness', 'behind the scenes', 'storytelling', 'song promotion', 'transition hook', 'vibes', 'engagement'],
    launch: ['song promotion', 'performance', 'show your skills / challenge', 'talking to camera', 'engagement'],
    post: ['performance', 'reaction', 'behind the scenes', 'relatable', 'storytelling', 'engagement', 'trending sounds'],
  });
  const PHASE_LABELS = deepFreeze({ pre: 'Preparación', launch: 'Lanzamiento', post: 'Sostener' });
  const CATEGORY_LABELS = deepFreeze({
    awareness: 'Reconocimiento',
    'behind the scenes': 'Detrás de cámaras',
    storytelling: 'Narrativa',
    'song promotion': 'Promoción de la canción',
    'transition hook': 'Gancho de transición',
    vibes: 'Vibes',
    engagement: 'Interacción',
    performance: 'Performance',
    'show your skills / challenge': 'Muestra tu talento / reto',
    'talking to camera': 'Hablando a cámara',
    reaction: 'Reacción',
    relatable: 'Identificable',
    'trending sounds': 'Sonidos en tendencia',
  });

  function text(value) {
    return value == null ? '' : String(value);
  }

  function clean(value) {
    return text(value).trim();
  }

  function normalizeToken(value) {
    return clean(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^[^\p{L}\p{N}#]+/u, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function toList(value) {
    if (Array.isArray(value)) return value.map(clean).filter(Boolean);
    return clean(value).split(',').map(clean).filter(Boolean);
  }

  function unique(values) {
    const seen = new Set();
    const out = [];
    values.forEach(value => {
      const key = normalizeToken(value);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(clean(value));
    });
    return out;
  }

  function hashString(value) {
    let hash = 2166136261;
    const input = text(value);
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function slug(value) {
    const base = normalizeToken(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return base || 'sin-id';
  }

  function stableRefId(reference, index) {
    const id = clean(reference && reference.id);
    if (id) return id;
    const key = [
      reference && (reference.key || reference.refId || reference.ref_id),
      reference && (reference.link || reference.url),
      reference && (reference.title || reference.titulo || reference.name),
      reference && reference.hook,
    ].map(clean).filter(Boolean).join('|');
    return `legacy-${slug(key).slice(0, 36)}-${hashString(key || index)}`;
  }

  function inferEnergy(reference) {
    const explicit = normalizeToken(reference && (reference.energy || reference.energia || reference.energía || reference.hookEnergy));
    if (ENERGY.includes(explicit)) return explicit;
    const body = normalizeToken(`${reference && reference.title || ''} ${reference && reference.hook || ''} ${reference && reference.comentarios || ''}`);
    if (/(challenge|reto|viral|trend|trending|show|performance|coro|loud|hype|energetic)/.test(body)) return 'high';
    if (/(acoustic|acustic|acustico|story|historia|relatable|emotional|emocional|behind|bts|diario)/.test(body)) return 'low';
    return 'medium';
  }

  function normalizeRef(reference, index) {
    const source = reference && typeof reference === 'object' ? reference : {};
    const cats = unique([
      ...toList(source.cat),
      ...toList(source.cats),
      ...toList(source.category),
      ...toList(source.categories),
      ...toList(source.categoria),
      ...toList(source.tags),
    ]);
    const forTags = unique([
      ...toList(source.for),
      ...toList(source.para),
      ...toList(source.audience),
      ...toList(source.audiences),
    ]);
    const id = stableRefId(source, index);
    return {
      ...source,
      _idx: Number.isInteger(source._idx) ? source._idx : index,
      id,
      refId: id,
      title: clean(source.title || source.titulo || source.name || source.nombre || 'Referencia'),
      hook: clean(source.hook || source.gancho || ''),
      cat: cats,
      cats,
      for: forTags,
      link: clean(source.link || source.url || source.refLink || ''),
      thumb: clean(source.thumb || source.miniatura || source.imagen || source.image || ''),
      comentarios: clean(source.comentarios || source.notas || source.description || source.descripcion || ''),
      icon: clean(source.icon || ''),
      energy: inferEnergy(source),
    };
  }

  function normalizeRefs(references) {
    const seen = new Set();
    const out = [];
    (Array.isArray(references) ? references : []).forEach((reference, index) => {
      const normalized = normalizeRef(reference, index);
      const key = normalized.id;
      if (!normalized.title || seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out;
  }

  function makeRefCatalog(references) {
    const source = Array.isArray(references) ? references : [];
    const refs = normalizeRefs(source);
    const byId = new Map();
    const byCanonicalIdx = new Map();
    const byCompactIdx = new Map();
    refs.forEach((reference, index) => {
      if (!byId.has(reference.id)) byId.set(reference.id, reference);
      if (!byCanonicalIdx.has(reference._idx)) byCanonicalIdx.set(reference._idx, reference);
      byCompactIdx.set(index, reference);
    });
    return {
      refs,
      byId,
      byCanonicalIdx,
      byCompactIdx,
      allowCompactIdx: source.length === refs.length,
    };
  }

  function catalogRefByIndex(catalog, refIdx, refId) {
    if (!catalog || !Number.isInteger(refIdx) || refIdx < 0) return null;
    const canonical = catalog.byCanonicalIdx.get(refIdx) || null;
    const compact = catalog.allowCompactIdx ? (catalog.byCompactIdx.get(refIdx) || null) : null;
    if (refId && canonical && canonical.id === refId) return canonical;
    if (refId && compact && compact.id === refId) return compact;
    if (canonical) return canonical;
    if (compact) return compact;
    return null;
  }

  function validateRefContract(piece, index, catalog, errors) {
    const refId = clean(piece.refId);
    const hasRefIdx = Object.prototype.hasOwnProperty.call(piece, 'refIdx');
    const refIdx = piece.refIdx;
    if (piece.fallback === true && !refId && hasRefIdx && refIdx === -1) return;
    if (!refId) {
      errors.push({ code: 'MISSING_REF_ID', index });
      return;
    }
    if (!catalog.byId.has(refId)) errors.push({ code: 'UNKNOWN_REF_ID', index, refId });
    if (!hasRefIdx || !Number.isInteger(refIdx) || refIdx < 0) {
      errors.push({ code: 'INVALID_REF_IDX', index, refIdx });
      return;
    }
    const indexedRef = catalogRefByIndex(catalog, refIdx, refId);
    if (!indexedRef) {
      errors.push({ code: 'INVALID_REF_IDX', index, refIdx });
    } else if (indexedRef.id !== refId) {
      errors.push({ code: 'REF_MISMATCH', index, refId, refIdx, expectedRefId: indexedRef.id });
    }
  }

  function normalizeIdSet(values) {
    const set = new Set();
    toList(values).forEach(value => set.add(clean(value)));
    return set;
  }

  function usageValue(usage, id) {
    if (!usage || typeof usage !== 'object') return 0;
    return Number(usage[id] || usage[`id:${id}`] || 0) || 0;
  }

  function isEvergreen(reference) {
    if (!reference || typeof reference !== 'object') return false;
    if (reference.evergreen === true || reference.isEvergreen === true) return true;
    const type = normalizeToken(reference.type || reference.kind || reference.campaignType || reference.status);
    if (type === 'evergreen' || type === 'always-on') return true;
    return [...toList(reference.cat), ...toList(reference.cats), ...toList(reference.categories)].some(tag => {
      const key = normalizeToken(tag);
      return key === 'evergreen' || key === 'always-on';
    });
  }

  function isCustomReference(reference) {
    if (!reference || typeof reference !== 'object') return false;
    if (reference.custom === true || reference.owned === true || reference.owned === false || reference.community === true) return true;
    const id = normalizeToken(reference.id || reference.refId || '');
    if (id.startsWith('custom-') || id.startsWith('own-') || id.startsWith('propia-')) return true;
    const type = normalizeToken(reference.type || reference.kind || reference.source || reference.origin);
    if (['custom', 'personal', 'propia', 'own', 'community'].includes(type)) return true;
    return [...toList(reference.cat), ...toList(reference.cats), ...toList(reference.categories)].some(tag => {
      const key = normalizeToken(tag);
      return key === 'custom' || key === 'personal' || key === 'propia';
    });
  }

  function listFilter(values) {
    const list = toList(values).map(normalizeToken).filter(Boolean);
    return list.length ? new Set(list) : null;
  }

  function refHasAny(reference, field, expected) {
    if (!expected || !expected.size) return true;
    const values = field === 'cat' ? (reference.cats || reference.cat || []) : toList(reference[field]);
    return values.some(value => expected.has(normalizeToken(value)));
  }

  function matchesHook(reference, hook) {
    const value = clean(hook);
    if (!value) return true;
    const key = normalizeToken(value);
    if (ENERGY.includes(key)) return reference.energy === key;
    return normalizeToken(`${reference.hook} ${reference.title} ${reference.comentarios}`).includes(key);
  }

  function sortRefs(references, usage) {
    return references.slice().sort((a, b) => {
      const used = usageValue(usage, a.id) - usageValue(usage, b.id);
      if (used) return used;
      const byId = a.id.localeCompare(b.id);
      if (byId) return byId;
      return (a._idx || 0) - (b._idx || 0);
    });
  }

  function filterRefs(references, options) {
    const opts = options || {};
    const previousUsage = opts.previousUsage || opts.usage || {};
    const excluded = normalizeIdSet([...(toList(opts.excludeIds)), ...(toList(opts.excludedIds))]);
    if (opts.excludeUsed === true) toList(opts.usedIds).forEach(id => excluded.add(id));
    const categories = listFilter(opts.categories || opts.category || opts.cat || opts.cats);
    const energy = listFilter(opts.energy || opts.energia || opts.energía || opts.hookEnergy);
    const hook = opts.hook;
    const hardFiltered = normalizeRefs(references).filter(reference => {
      if (excluded.has(reference.id) || excluded.has(`id:${reference.id}`)) return false;
      if (opts.excludeEvergreen !== false && isEvergreen(reference)) return false;
      if (opts.excludeCustom !== false && isCustomReference(reference)) return false;
      if (opts.excludePreviousUsage === true && usageValue(previousUsage, reference.id) > 0) return false;
      return true;
    });

    const applySoft = (pool, includeCategory, includeEnergy, includeHook) => pool.filter(reference => {
      if (includeCategory && !refHasAny(reference, 'cat', categories)) return false;
      if (includeEnergy && energy && !energy.has(reference.energy)) return false;
      if (includeHook && !matchesHook(reference, hook)) return false;
      return true;
    });

    const stages = [
      [true, true, true],
      [true, true, false],
      [true, false, false],
      [false, false, false],
    ];
    for (let level = 0; level < stages.length; level += 1) {
      const [includeCategory, includeEnergy, includeHook] = stages[level];
      const result = sortRefs(applySoft(hardFiltered, includeCategory, includeEnergy, includeHook), previousUsage);
      if (result.length || opts.allowFallback === false) return result;
    }
    return [];
  }

  function phaseForOffset(offset) {
    if (offset < 0) return 'pre';
    if (offset === 0) return 'launch';
    return 'post';
  }

  function slotEnergy(offset, anchorKey) {
    if (anchorKey || offset === 0) return 'high';
    if (offset < -14 || offset > 14) return 'low';
    return 'medium';
  }

  function parseDate(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== month - 1
      || date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function addDaysISO(baseISO, offset) {
    const date = parseDate(baseISO);
    if (!date) return '';
    date.setUTCDate(date.getUTCDate() + offset);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  function makeSlots(launchOrDate) {
    const dropDate = typeof launchOrDate === 'string' ? launchOrDate : clean(launchOrDate && launchOrDate.date);
    const slots = [];
    for (let offset = DAY_START; offset <= DAY_END; offset += 1) {
      const anchors = ANCHORS.filter(anchor => anchor.offset === offset);
      const phase = phaseForOffset(offset);
      if (anchors.length) {
        anchors.forEach((anchor, index) => {
          slots.push({
            key: anchor.key,
            offset,
            day: offset,
            date: addDaysISO(dropDate, offset),
            fecha: addDaysISO(dropDate, offset),
            phase,
            anchor: true,
            anchorIndex: index,
            title: anchor.title,
            cat: anchor.cat,
            categories: anchor.categories.slice(),
            energy: slotEnergy(offset, anchor.key),
          });
        });
      } else {
        const categories = PHASE_CATEGORIES[phase];
        const category = categories[Math.abs(offset + PLAN_PIECE_COUNT) % categories.length];
        slots.push({
          key: `${phase}-${offset}`,
          offset,
          day: offset,
          date: addDaysISO(dropDate, offset),
          fecha: addDaysISO(dropDate, offset),
          phase,
          anchor: false,
          title: '',
          cat: category,
          categories: [category],
          energy: slotEnergy(offset, ''),
        });
      }
    }
    return slots;
  }

  function boundedDays(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 365) : fallback;
  }

  function makeFreeDaySlots(launchOrDate, maxPieces, occupiedDates) {
    const launch = typeof launchOrDate === 'string' ? { date: launchOrDate } : (launchOrDate || {});
    const dropDate = clean(launch.date);
    const pre = boundedDays(launch.preDays, Math.abs(DAY_START));
    const post = boundedDays(launch.postDays, DAY_END);
    const limit = Math.max(0, Math.min(MAX_FREE_DAY_PIECES, boundedDays(maxPieces, MAX_FREE_DAY_PIECES)));
    const occupied = occupiedDates instanceof Set ? occupiedDates : new Set(toList(occupiedDates));
    const slots = [];
    for (let offset = -pre; offset <= post && slots.length < limit; offset += 1) {
      const phase = phaseForOffset(offset);
      const fecha = addDaysISO(dropDate, offset);
      if (occupied.has(fecha)) continue;
      const categories = PHASE_CATEGORIES[phase];
      const category = categories[Math.abs(offset + PLAN_PIECE_COUNT) % categories.length];
      slots.push({
        key: `${phase}-${offset}`,
        offset,
        day: offset,
        date: fecha,
        fecha,
        phase,
        anchor: false,
        title: '',
        cat: category,
        categories: [category],
        energy: slotEnergy(offset, ''),
      });
    }
    return slots;
  }

  function plannedId(launch, slot) {
    const launchId = slug((launch && launch.id) || (launch && launch.name) || 'launch');
    return `plan-${launchId}-${slot.offset}-${slot.key}`;
  }

  function makePlaceholder(slot, launch, index) {
    const title = slot.title || `Pieza ${index + 1}`;
    return {
      id: plannedId(launch, slot),
      source: 'plan',
      fallback: true,
      anchor: slot.anchor,
      anchorKey: slot.anchor ? slot.key : '',
      title,
      offset: slot.offset,
      day: slot.offset,
      phase: slot.phase,
      fecha: slot.fecha,
      date: slot.date,
      cat: slot.cat,
      cats: [slot.cat].filter(Boolean),
      refId: '',
      refIdx: -1,
      refLink: '',
      production: { objetivo: '', hook: '', descripcion: '', plataforma: '', estado: 'pendiente', responsable: '', guion: [], shots: [], assets: [] },
    };
  }

  function makePiece(slot, reference, launch, index) {
    if (!reference) return makePlaceholder(slot, launch, index);
    const title = slot.title || reference.title || `Pieza ${index + 1}`;
    const cats = unique([slot.cat, ...(reference.cats || reference.cat || [])]);
    return {
      id: plannedId(launch, slot),
      source: 'plan',
      fallback: false,
      anchor: slot.anchor,
      anchorKey: slot.anchor ? slot.key : '',
      title,
      offset: slot.offset,
      day: slot.offset,
      phase: slot.phase,
      fecha: slot.fecha,
      date: slot.date,
      cat: cats[0] || 'awareness',
      cats,
      for: Array.isArray(reference.for) ? reference.for.slice() : [],
      refId: reference.id,
      refIdx: reference._idx,
      refLink: reference.link || '',
      thumb: reference.thumb || '',
      icon: reference.icon || '',
      production: {
        objetivo: '',
        hook: reference.hook || '',
        descripcion: reference.comentarios || '',
        plataforma: '',
        estado: 'pendiente',
        responsable: '',
        guion: [],
        shots: [],
        assets: [],
      },
    };
  }

  function normalizeExistingPiece(piece, catalog) {
    const source = piece && typeof piece === 'object' ? piece : {};
    const refCatalog = catalog && catalog.refs ? catalog : makeRefCatalog(catalog);
    let refId = clean(source.refId || source.ref_id || '');
    let refIdx = Number.isInteger(source.refIdx) ? source.refIdx : (Number.isInteger(source.ref_idx) ? source.ref_idx : -1);
    const indexedRef = catalogRefByIndex(refCatalog, refIdx);
    if (!refId && indexedRef) refId = indexedRef.id;
    if (refId && (!indexedRef || indexedRef.id !== refId)) {
      const found = refCatalog.byId.get(refId);
      if (found) refIdx = found._idx;
    }
    const normalized = {
      ...source,
      source: source.source || 'plan',
      title: clean(source.title || source.titulo || source.name || source.nombre || 'Pieza'),
      fecha: clean(source.fecha || source.date || ''),
      date: clean(source.date || source.fecha || ''),
      refId,
      refIdx,
    };
    if (!normalized.refLink && refId && refCatalog.byId.has(refId)) normalized.refLink = refCatalog.byId.get(refId).link || '';
    return normalized;
  }

  function isLockedPiece(piece) {
    return !!(piece && (piece.locked === true || piece.humanLocked === true || (piece.lock && piece.lock.human === true)));
  }

  function lockedDatesFromLaunch(launch, includeAllCalendarItems) {
    const dates = new Set();
    const add = (piece, includeAll) => {
      if (includeAll || isLockedPiece(piece)) {
        const date = clean(piece.fecha || piece.date);
        if (date) dates.add(date);
      }
    };
    (Array.isArray(launch && launch.cal) ? launch.cal : []).forEach(piece => add(piece, includeAllCalendarItems));
    const plan = launch && launch.plan;
    (Array.isArray(plan && plan.pieces) ? plan.pieces : []).forEach(piece => add(piece, false));
    return dates;
  }

  function normalizeExistingPlan(plan, references) {
    const catalog = references && references.refs ? references : makeRefCatalog(references);
    if (Array.isArray(plan)) {
      return { legacyPieces: plan.map(piece => normalizeExistingPiece(piece, catalog)) };
    }
    if (!plan || typeof plan !== 'object') return {};
    const out = { ...plan };
    if (Array.isArray(plan.pieces)) out.pieces = plan.pieces.map(piece => normalizeExistingPiece(piece, catalog));
    else if (Array.isArray(plan.items)) {
      out.legacyPieces = plan.items.map(piece => normalizeExistingPiece(piece, catalog));
    } else if (Array.isArray(plan.calendar)) {
      out.legacyPieces = plan.calendar.map(piece => normalizeExistingPiece(piece, catalog));
    }
    return out;
  }

  function dayRows(slots, pieces) {
    const byOffset = new Map();
    slots.forEach(slot => {
      if (!byOffset.has(slot.offset)) {
        byOffset.set(slot.offset, {
          offset: slot.offset,
          day: slot.offset,
          date: slot.date,
          fecha: slot.fecha,
          phase: slot.phase,
          pieceIds: [],
        });
      }
    });
    pieces.forEach(piece => {
      const day = byOffset.get(piece.offset);
      if (day) day.pieceIds.push(piece.id);
    });
    return Array.from(byOffset.values()).sort((a, b) => a.offset - b.offset);
  }

  function calcUsage(planOrPieces, baseUsage) {
    const usage = { ...(baseUsage && typeof baseUsage === 'object' ? baseUsage : {}) };
    const pieces = Array.isArray(planOrPieces)
      ? planOrPieces
      : (Array.isArray(planOrPieces && planOrPieces.pieces) ? planOrPieces.pieces : []);
    pieces.forEach(piece => {
      const refId = clean(piece && (piece.refId || piece.ref_id));
      if (!refId) return;
      usage[refId] = (Number(usage[refId]) || 0) + 1;
    });
    return usage;
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function primaryCategory(value) {
    const cats = unique([
      ...toList(value && value.cat),
      ...toList(value && value.cats),
      ...toList(value && value.category),
      ...toList(value && value.categories),
    ]);
    return cats[0] || 'awareness';
  }

  function categoryLabel(value) {
    const key = normalizeToken(value);
    return CATEGORY_LABELS[key] || clean(value) || 'pieza';
  }

  function recommendationReason(piece, reference) {
    if (piece && !reference && clean(piece.recommendationReason)) return clean(piece.recommendationReason);
    const phase = clean((piece && piece.phase) || (Number.isInteger(piece && piece.offset) ? phaseForOffset(piece.offset) : ''));
    const phaseLabel = PHASE_LABELS[phase] || 'Campaña';
    const cat = primaryCategory(reference || piece || {});
    const hook = clean((reference && reference.hook) || (piece && piece.hook) || (piece && piece.production && piece.production.hook));
    return `${phaseLabel}: ${categoryLabel(cat)} compatible con la fase${hook ? ' y hook claro' : ''}.`;
  }

  function findPieceInLaunch(launch, pieceOrId) {
    if (pieceOrId && typeof pieceOrId === 'object') return pieceOrId;
    const id = clean(pieceOrId);
    if (!id || !launch) return null;
    const cal = Array.isArray(launch.cal) ? launch.cal : [];
    const planPieces = Array.isArray(launch.plan && launch.plan.pieces) ? launch.plan.pieces : [];
    return cal.concat(planPieces).find(piece => clean(piece && piece.id) === id || clean(piece && piece.planPieceId) === id) || null;
  }

  function launchUsedRefIds(launch) {
    const used = new Set();
    const add = piece => {
      const id = clean(piece && (piece.refId || piece.ref_id));
      if (id) used.add(id);
    };
    (Array.isArray(launch && launch.cal) ? launch.cal : []).forEach(add);
    (Array.isArray(launch && launch.plan && launch.plan.pieces) ? launch.plan.pieces : []).forEach(add);
    return used;
  }

  function launchReplacementExclusions(launch) {
    const meta = (launch && launch.planMeta) || {};
    return [
      ...toList(meta.replacementExcludedRefIds),
      ...toList(meta.excludedRefIds),
      ...toList(meta.outgoingRefIds),
    ];
  }

  function replacementCandidates(arg, refsArg, pieceArg, optsArg) {
    const launch = (arg && arg.launch) || arg || {};
    const sourceReferences = (arg && arg.references) || refsArg || [];
    const opts = {
      ...(arg && arg.options && typeof arg.options === 'object' ? arg.options : {}),
      ...(optsArg && typeof optsArg === 'object' ? optsArg : {}),
    };
    const piece = findPieceInLaunch(launch, (arg && (arg.piece || arg.item || arg.itemId || arg.pieceId)) || pieceArg);
    if (!piece || isLockedPiece(piece) || piece.anchor === true || clean(piece.anchorKey)) return [];
    const phase = clean(piece.phase) || (Number.isInteger(piece.offset) ? phaseForOffset(piece.offset) : '');
    const categories = PHASE_CATEGORIES[phase] || toList(piece.cats || piece.cat || primaryCategory(piece));
    const excluded = new Set([
      ...Array.from(launchUsedRefIds(launch)),
      ...launchReplacementExclusions(launch),
      ...toList(opts.excludeIds),
    ]);
    const currentRef = clean(piece.refId || piece.ref_id);
    if (currentRef) excluded.add(currentRef);
    const candidates = filterRefs(sourceReferences, {
      categories,
      energy: piece.energy || (Number.isInteger(piece.offset) ? slotEnergy(piece.offset, piece.anchorKey) : ''),
      hook: opts.hook || '',
      excludeIds: Array.from(excluded),
      excludeEvergreen: opts.excludeEvergreen !== false,
      excludeCustom: opts.excludeCustom !== false,
      allowFallback: false,
      previousUsage: opts.previousUsage || opts.usage || {},
    });
    const limit = Number.isFinite(Number(opts.limit)) ? Math.max(0, Math.floor(Number(opts.limit))) : 6;
    return limit ? candidates.slice(0, limit) : candidates;
  }

  function replacePieceReference(piece, reference, references) {
    const source = piece && typeof piece === 'object' ? piece : {};
    const catalog = references && references.refs ? references : makeRefCatalog(Array.isArray(references) ? references : [reference]);
    const ref = reference && reference.id && catalog.byId.has(reference.id)
      ? catalog.byId.get(reference.id)
      : normalizeRef(reference || {}, Number.isInteger(reference && reference._idx) ? reference._idx : 0);
    const cats = unique([...(ref.cats || ref.cat || []), source.cat].filter(Boolean));
    const production = source.production && typeof source.production === 'object'
      ? cloneData(source.production)
      : { objetivo: '', hook: '', descripcion: '', plataforma: '', estado: 'pendiente', responsable: '', guion: [], shots: [], assets: [] };
    const updated = {
      ...source,
      source: source.source || 'plan',
      fallback: false,
      title: ref.title || source.title || 'Pieza',
      cat: cats[0] || source.cat || 'awareness',
      cats,
      for: Array.isArray(ref.for) ? ref.for.slice() : [],
      refId: ref.id,
      refIdx: ref._idx,
      refLink: ref.link || '',
      thumb: ref.thumb || '',
      icon: ref.icon || '',
      production,
    };
    updated.recommendationReason = recommendationReason(updated, ref);
    return updated;
  }

  function buildPlan(arg, refsArg, optsArg) {
    const launch = (arg && arg.launch) || arg || {};
    const sourceReferences = (arg && arg.references) || refsArg || [];
    const refCatalog = makeRefCatalog(sourceReferences);
    const references = refCatalog.refs;
    const opts = {
      ...(arg && arg.options && typeof arg.options === 'object' ? arg.options : {}),
      ...(optsArg && typeof optsArg === 'object' ? optsArg : {}),
    };
    const previousUsage = (arg && (arg.usage || arg.previousUsage)) || opts.previousUsage || opts.usage || {};
    const excludeIds = [...toList(opts.excludeIds), ...toList(arg && arg.excludeIds)];
    const freeDayMode = opts.freeDaysOnly === true || opts.onlyFreeDays === true;
    const lockedDates = lockedDatesFromLaunch(launch, freeDayMode);
    const slots = freeDayMode ? makeFreeDaySlots(launch, opts.maxPieces, lockedDates) : makeSlots(launch);
    const usedIds = new Set(excludeIds);
    const pieces = [];
    let fallbackCount = 0;

    slots.forEach((slot, index) => {
      const candidates = filterRefs(references, {
        categories: slot.categories,
        energy: slot.energy,
        hook: opts.hook || '',
        excludeIds: Array.from(usedIds),
        excludeEvergreen: opts.excludeEvergreen !== false,
        excludeCustom: opts.excludeCustom !== false,
        excludePreviousUsage: opts.excludePreviousUsage === true,
        previousUsage,
      });
      const reference = candidates[0] || null;
      if (reference) usedIds.add(reference.id);
      else fallbackCount += 1;
      pieces.push(makePiece(slot, reference, launch, index));
      pieces[pieces.length - 1].recommendationReason = recommendationReason(pieces[pieces.length - 1], reference);
    });

    const selfErrors = [];
    pieces.forEach((piece, index) => {
      if (piece.fallback && !piece.refId && piece.refIdx === -1) return;
      validateRefContract(piece, index, refCatalog, selfErrors);
    });
    if (selfErrors.length) {
      const error = new Error(`TempoPlan buildPlan generated invalid ref contract: ${selfErrors.map(item => item.code).join(', ')}`);
      error.errors = selfErrors;
      throw error;
    }

    const days = dayRows(slots, pieces);
    const existing = normalizeExistingPlan(launch.plan, refCatalog);
    const legacyPieces = existing.legacyPieces || (Array.isArray(existing.pieces) ? existing.pieces : []);
    const plan = {
      ...existing,
      version: PLAN_VERSION,
      source: 'plan',
      range: freeDayMode
        ? {
            startOffset: slots.length ? Math.min(...slots.map(slot => slot.offset)) : -(boundedDays(launch.preDays, Math.abs(DAY_START))),
            endOffset: slots.length ? Math.max(...slots.map(slot => slot.offset)) : boundedDays(launch.postDays, DAY_END),
            days: slots.length,
            pieces: pieces.length,
            freeDaysOnly: true,
            maxPieces: Math.min(MAX_FREE_DAY_PIECES, boundedDays(opts.maxPieces, MAX_FREE_DAY_PIECES)),
            lockedDays: lockedDates.size,
          }
        : { startOffset: DAY_START, endOffset: DAY_END, days: PLAN_DAY_COUNT, pieces: PLAN_PIECE_COUNT },
      days,
      pieces,
      usage: calcUsage(pieces),
      meta: {
        ...(existing.meta && typeof existing.meta === 'object' ? existing.meta : {}),
        candidateCount: references.length,
        fallbackCount,
        legacyPieceCount: legacyPieces.length,
        lockedPieceCount: Array.from(lockedDates).length,
      },
    };
    if (legacyPieces.length) plan.legacyPieces = legacyPieces;
    return { ...launch, plan };
  }

  function boundedText(value, max) {
    return clean(value).replace(/\s+/g, ' ').slice(0, max);
  }

  function campaignAIContext(launch) {
    const dna = (launch && launch.dna) || {};
    const personality = (launch && launch.artistDNA && launch.artistDNA.personality) || {};
    return {
      campaign: boundedText(launch && (launch.name || launch.title), 120),
      releaseDate: boundedText(launch && launch.date, 10),
      concept: boundedText(dna.about || dna.concept || '', 300),
      emotion: boundedText(dna.emotion || '', 120),
      message: boundedText(dna.message || '', 300),
      keywords: boundedText(dna.keywords || '', 180),
      tone: boundedText(personality.tone || '', 120),
      lyricsExcerpt: boundedText(launch && (launch.letra || launch.lyrics), 600),
    };
  }

  function buildAIOrderingRequest(launch, baseline, references, options) {
    const opts = options || {};
    const catalog = makeRefCatalog(references);
    const plan = baseline && baseline.plan ? baseline.plan : { pieces: [] };
    const requestedLimit = Number.isFinite(Number(opts.candidateLimit)) ? Math.floor(Number(opts.candidateLimit)) : 60;
    const candidateLimit = Math.max(1, Math.min(60, requestedLimit));
    const candidates = [];
    const seen = new Set();
    (plan.pieces || []).forEach(piece => {
      const refId = clean(piece && piece.refId);
      if (!refId || seen.has(refId) || !catalog.byId.has(refId) || candidates.length >= candidateLimit) return;
      seen.add(refId);
      const reference = catalog.byId.get(refId);
      candidates.push({
        id: reference.id,
        title: boundedText(reference.title, 160),
        categories: (reference.cats || reference.cat || []).slice(0, 4).map(value => boundedText(value, 60)),
        hook: boundedText(reference.hook, 180),
      });
    });
    return {
      context: campaignAIContext(launch),
      slots: (plan.pieces || []).map(piece => ({
        pieceId: clean(piece.id),
        offset: piece.offset,
        date: clean(piece.fecha || piece.date),
        phase: clean(piece.phase),
      })),
      candidates,
      responseContract: 'Devuelve JSON: {"selections":[{"pieceId":"ID de slot","refId":"ID de candidata","reason":"motivo breve"}]}. Usa únicamente los IDs entregados; no agregues slots ni referencias.',
    };
  }

  function planAIEligibility(options) {
    const opts = options || {};
    if (opts.permission !== true) return { ok: false, reason: 'permission' };
    if (opts.configured !== true) return { ok: false, reason: 'configuration' };
    if (opts.quota !== true) return { ok: false, reason: 'quota' };
    if (typeof opts.request !== 'function') return { ok: false, reason: 'provider_failure' };
    return { ok: true, reason: '' };
  }

  function normalizeAIOrderingResponse(response) {
    let value = response;
    if (value && typeof value === 'object' && typeof value.text === 'string') value = value.text;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); }
      catch (_error) { return { selections: [], parseError: true }; }
    }
    const selections = Array.isArray(value)
      ? value
      : (Array.isArray(value && value.selections) ? value.selections
        : (Array.isArray(value && value.choices) ? value.choices : []));
    return { selections: selections.filter(item => item && typeof item === 'object'), parseError: false };
  }

  function safeAIReason(value) {
    return boundedText(value, 240);
  }

  function validateAIOrdering(response, request, baseline) {
    const parsed = normalizeAIOrderingResponse(response);
    const errors = [];
    const slots = new Set((request.slots || []).map(slot => slot.pieceId).filter(Boolean));
    const candidateIds = new Set((request.candidates || []).map(candidate => candidate.id).filter(Boolean));
    const pieces = (baseline && baseline.plan && baseline.plan.pieces) || [];
    const fallbackOwner = new Map();
    pieces.forEach(piece => {
      const refId = clean(piece && piece.refId);
      if (refId) fallbackOwner.set(refId, clean(piece.id));
    });
    if (parsed.parseError) errors.push({ code: 'INVALID_AI_JSON' });
    const assignments = new Map();
    const assignedRefs = new Set();
    parsed.selections.forEach((selection, index) => {
      const pieceId = clean(selection.pieceId || selection.slotId || selection.id);
      const refId = clean(selection.refId || selection.referenceId || selection.candidateId);
      if (!slots.has(pieceId)) {
        errors.push({ code: 'UNKNOWN_SLOT', index, pieceId });
        return;
      }
      if (!candidateIds.has(refId)) {
        errors.push({ code: 'UNKNOWN_CANDIDATE_REF', index, refId });
        return;
      }
      if (assignments.has(pieceId)) {
        errors.push({ code: 'DUPLICATE_SLOT', index, pieceId });
        return;
      }
      if (assignedRefs.has(refId)) {
        errors.push({ code: 'DUPLICATE_REF_ID', index, refId });
        return;
      }
      assignments.set(pieceId, { refId, reason: safeAIReason(selection.reason || selection.explanation) });
      assignedRefs.add(refId);
    });
    // Una respuesta parcial solo puede aplicar ciclos completos de la asignación
    // determinista. Así, la IA nunca deja duplicados al rellenar el resto offline.
    let removed = true;
    while (removed) {
      removed = false;
      Array.from(assignments.entries()).forEach(([pieceId, assignment]) => {
        const owner = fallbackOwner.get(assignment.refId);
        if (owner && owner !== pieceId && !assignments.has(owner)) {
          assignments.delete(pieceId);
          errors.push({ code: 'UNSAFE_PARTIAL_REORDER', pieceId, refId: assignment.refId });
          removed = true;
        }
      });
    }
    return { assignments, errors, parseError: parsed.parseError };
  }

  function assistedPlanFromOrdering(baseline, references, ordering) {
    const catalog = makeRefCatalog(references);
    const plan = cloneData(baseline.plan);
    const assignments = ordering.assignments || new Map();
    plan.pieces = plan.pieces.map(piece => {
      const assignment = assignments.get(clean(piece.id));
      if (!assignment || !catalog.byId.has(assignment.refId)) return piece;
      const assignedReference = catalog.byId.get(assignment.refId);
      const next = replacePieceReference(piece, assignedReference, catalog);
      next.production = {
        ...(next.production || {}),
        hook: assignedReference.hook || '',
        descripcion: assignedReference.comentarios || '',
      };
      if (assignment.reason) next.recommendationReason = assignment.reason;
      return next;
    });
    plan.days = dayRows((plan.pieces || []).map(piece => ({
      offset: piece.offset,
      day: piece.day,
      date: piece.date,
      fecha: piece.fecha,
      phase: piece.phase,
    })), plan.pieces);
    plan.usage = calcUsage(plan.pieces);
    return { ...baseline, plan };
  }

  function offlineAIResult(baseline, reason, errors) {
    const plan = cloneData(baseline.plan);
    const meta = {
      mode: 'offline',
      reason,
      summary: 'Plan generado con el motor offline.',
      aiUsageCount: 0,
    };
    plan.meta = { ...(plan.meta || {}), assistance: meta };
    const launch = { ...baseline, plan };
    return { mode: 'offline', launch, plan, meta, validation: { errors: errors || [], accepted: 0 } };
  }

  function callWithTimeout(request, payload, timeoutMs) {
    const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(30000, Math.floor(Number(timeoutMs)))) : 8000;
    let timer;
    const requestPromise = Promise.resolve().then(() => request(payload));
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error('AI_TIMEOUT');
        error.code = 'AI_TIMEOUT';
        reject(error);
      }, timeout);
    });
    return Promise.race([requestPromise, timeoutPromise]).finally(() => clearTimeout(timer));
  }

  async function arrangePlanWithAI(arg, refsArg, optsArg) {
    const launch = (arg && arg.launch) || arg || {};
    const references = (arg && arg.references) || refsArg || [];
    const options = {
      ...(arg && arg.options && typeof arg.options === 'object' ? arg.options : {}),
      ...(optsArg && typeof optsArg === 'object' ? optsArg : {}),
    };
    const baseline = buildPlan(launch, references, options);
    const eligibility = planAIEligibility(options);
    if (!eligibility.ok) return offlineAIResult(baseline, eligibility.reason, []);
    const request = buildAIOrderingRequest(launch, baseline, references, options);
    let response;
    try {
      response = await callWithTimeout(options.request, request, options.timeoutMs);
    } catch (error) {
      return offlineAIResult(baseline, error && error.code === 'AI_TIMEOUT' ? 'timeout' : 'provider_failure', []);
    }
    const ordering = validateAIOrdering(response, request, baseline);
    if (!ordering.assignments.size) return offlineAIResult(baseline, 'invalid_response', ordering.errors);
    const assisted = assistedPlanFromOrdering(baseline, references, ordering);
    const fallbackCount = Math.max(0, assisted.plan.pieces.length - ordering.assignments.size);
    const meta = {
      mode: 'assisted',
      summary: `IA ordenó ${ordering.assignments.size} pieza${ordering.assignments.size === 1 ? '' : 's'}; el motor offline completó ${fallbackCount}.`,
      aiUsageCount: 1,
    };
    assisted.plan.meta = { ...(assisted.plan.meta || {}), assistance: meta };
    return { mode: 'assisted', launch: assisted, plan: assisted.plan, meta, validation: { errors: ordering.errors, accepted: ordering.assignments.size } };
  }

  function normalizeAIInput(input) {
    let data = input;
    if (typeof input === 'string') {
      try { data = JSON.parse(input); } catch (error) { return { parseError: error, pieces: [], days: [] }; }
    }
    const plan = data && data.plan ? data.plan : data;
    const pieces = Array.isArray(plan) ? plan
      : (Array.isArray(plan && plan.pieces) ? plan.pieces
        : (Array.isArray(plan && plan.items) ? plan.items
          : (Array.isArray(plan && plan.calendar) ? plan.calendar : [])));
    const days = Array.isArray(plan && plan.days) ? plan.days : [];
    return {
      pieces: pieces.map(piece => (piece && typeof piece === 'object' ? piece : {})),
      days,
    };
  }

  function requiredOffsetCounts() {
    const counts = new Map();
    for (let offset = DAY_START; offset <= DAY_END; offset += 1) {
      const anchorCount = ANCHORS.filter(anchor => anchor.offset === offset).length;
      counts.set(offset, anchorCount || 1);
    }
    return counts;
  }

  function validateOffsetValue(value, errors, code, index) {
    if (!Number.isInteger(value)) {
      errors.push({ code, index, offset: value });
      return null;
    }
    if (value < DAY_START || value > DAY_END) {
      errors.push({ code: 'OFFSET_OUT_OF_RANGE', index, offset: value });
      return null;
    }
    return value;
  }

  function validateISODate(value, errors, index, field) {
    const date = clean(value);
    if (!date) return;
    if (!parseDate(date)) errors.push({ code: 'INVALID_DATE', index, field, date });
  }

  function validateCompleteOffsets(pieces, days, errors) {
    const expectedPieceCounts = requiredOffsetCounts();
    const pieceCounts = new Map();
    pieces.forEach(piece => {
      if (!Number.isInteger(piece.offset) || piece.offset < DAY_START || piece.offset > DAY_END) return;
      pieceCounts.set(piece.offset, (pieceCounts.get(piece.offset) || 0) + 1);
    });
    expectedPieceCounts.forEach((expected, offset) => {
      const actual = pieceCounts.get(offset) || 0;
      if (actual !== expected) errors.push({ code: 'INVALID_OFFSET_COUNT', offset, expected, actual });
    });
    pieceCounts.forEach((actual, offset) => {
      if (!expectedPieceCounts.has(offset)) errors.push({ code: 'UNEXPECTED_OFFSET', offset, actual });
    });

    if (!days.length) return;
    const dayCounts = new Map();
    days.forEach(day => {
      if (!day || typeof day !== 'object') return;
      if (!Number.isInteger(day.offset) || day.offset < DAY_START || day.offset > DAY_END) return;
      dayCounts.set(day.offset, (dayCounts.get(day.offset) || 0) + 1);
    });
    for (let offset = DAY_START; offset <= DAY_END; offset += 1) {
      const actual = dayCounts.get(offset) || 0;
      if (actual !== 1) errors.push({ code: 'INVALID_DAY_OFFSET_COUNT', offset, expected: 1, actual });
    }
    dayCounts.forEach((actual, offset) => {
      if (offset < DAY_START || offset > DAY_END) errors.push({ code: 'UNEXPECTED_DAY_OFFSET', offset, actual });
    });
  }

  function canonicalAnchorKey(piece) {
    if (!piece || typeof piece !== 'object') return '';
    return clean(piece.anchorKey || piece.key || (typeof piece.anchor === 'string' ? piece.anchor : ''));
  }

  function pieceHasAnchorIdentity(piece, anchor) {
    return piece
      && piece.anchor === true
      && canonicalAnchorKey(piece) === anchor.key
      && piece.offset === anchor.offset;
  }

  function validateAnchors(pieces, errors) {
    const seen = new Set();
    pieces.forEach((piece, index) => {
      const key = canonicalAnchorKey(piece);
      if (piece.anchor !== true && !key) return;
      const anchor = ANCHORS.find(item => item.key === key);
      if (piece.anchor !== true || !anchor) {
        errors.push({ code: 'INVALID_ANCHOR_IDENTITY', index, anchorKey: key });
        return;
      }
      if (seen.has(key)) errors.push({ code: 'DUPLICATE_ANCHOR', index, anchor: key });
      seen.add(key);
      if (piece.offset !== anchor.offset) {
        errors.push({ code: 'ANCHOR_OFFSET_MISMATCH', index, anchor: key, expected: anchor.offset, actual: piece.offset });
      }
    });
    ANCHORS.forEach(anchor => {
      if (!pieces.some(piece => pieceHasAnchorIdentity(piece, anchor))) {
        errors.push({ code: 'MISSING_ANCHOR', anchor: anchor.key });
      }
    });
  }

  function validateAI(input, references, options) {
    const opts = options || {};
    const normalized = normalizeAIInput(input);
    const errors = [];
    const warnings = [];
    if (normalized.parseError) errors.push({ code: 'INVALID_JSON', message: 'La respuesta no es JSON válido' });
    const refCatalog = makeRefCatalog(references);
    const ids = new Set();
    const usedRefs = new Set();
    normalized.pieces.forEach((piece, index) => {
      if (!clean(piece.title)) errors.push({ code: 'EMPTY_TITLE', index });
      if (piece.source !== 'plan') errors.push({ code: 'INVALID_SOURCE', index, source: piece.source });
      if (piece.id) {
        if (ids.has(piece.id)) errors.push({ code: 'DUPLICATE_PIECE_ID', index, id: piece.id });
        ids.add(piece.id);
      }
      const refId = clean(piece.refId);
      validateRefContract(piece, index, refCatalog, errors);
      if (refId) {
        if (usedRefs.has(refId)) errors.push({ code: 'DUPLICATE_REF_ID', index, refId });
        usedRefs.add(refId);
      }
      validateOffsetValue(piece.offset, errors, 'INVALID_OFFSET', index);
      validateISODate(piece.date, errors, index, 'date');
      if (piece.fecha !== piece.date) validateISODate(piece.fecha, errors, index, 'fecha');
    });
    normalized.days.forEach((day, index) => {
      if (!day || typeof day !== 'object') {
        errors.push({ code: 'INVALID_DAY', index });
        return;
      }
      validateOffsetValue(day.offset, errors, 'INVALID_DAY_OFFSET', index);
      validateISODate(day.date, errors, index, 'day.date');
      if (day.fecha !== day.date) validateISODate(day.fecha, errors, index, 'day.fecha');
    });
    // validateAI en modo público exige el contrato completo 43/44. La única ruta
    // parcial documentada es allowPartialPlan:true para preflight interno de una
    // pieza o subconjunto antes de componer el plan final.
    const expectsComplete = opts.allowPartialPlan !== true;
    if (expectsComplete) {
      if (normalized.days.length && normalized.days.length !== PLAN_DAY_COUNT) {
        errors.push({ code: 'INVALID_DAY_COUNT', expected: PLAN_DAY_COUNT, actual: normalized.days.length });
      } else {
        const dayOffsets = normalized.days.length
          ? new Set(normalized.days.filter(day => day && typeof day === 'object' && Number.isInteger(day.offset)).map(day => day.offset)).size
          : new Set(normalized.pieces.filter(piece => Number.isInteger(piece.offset)).map(piece => piece.offset)).size;
        if (dayOffsets !== PLAN_DAY_COUNT) errors.push({ code: 'INVALID_DAY_COUNT', expected: PLAN_DAY_COUNT, actual: dayOffsets });
      }
      if (normalized.pieces.length !== PLAN_PIECE_COUNT) errors.push({ code: 'INVALID_PIECE_COUNT', expected: PLAN_PIECE_COUNT, actual: normalized.pieces.length });
      validateCompleteOffsets(normalized.pieces, normalized.days, errors);
      validateAnchors(normalized.pieces, errors);
    }
    return { ok: errors.length === 0, errors, warnings, pieces: normalized.pieces, days: normalized.days };
  }

  return deepFreeze({
    ANCHORS,
    arrangePlanWithAI,
    buildAIOrderingRequest,
    DAY_END,
    DAY_START,
    PLAN_DAY_COUNT,
    PLAN_PIECE_COUNT,
    PLAN_VERSION,
    buildPlan,
    calcUsage,
    filterRefs,
    makeSlots,
    planAIEligibility,
    makeFreeDaySlots,
    recommendationReason,
    replacementCandidates,
    replacePieceReference,
    validateAIOrdering,
    validateAI,
  });
});
