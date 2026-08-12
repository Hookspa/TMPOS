(function exposeCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root) root.TempoCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCatalogApi() {
  const CATALOG_HEADER = ['id', 'hook', 'title', 'for', 'cat', 'link', 'comentarios', 'thumb'];
  const CATALOG_MINIMUM_ROWS = 6066;

  function parseCsvStrict(input) {
    const text = String(input).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let quoteClosed = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
          quoteClosed = true;
        } else {
          field += char;
        }
      } else if (quoteClosed) {
        if (char === ',') {
          row.push(field);
          field = '';
          quoteClosed = false;
        } else if (char === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
          quoteClosed = false;
        } else {
          const error = new Error(`Carácter inesperado después de una comilla en la fila ${rows.length + 1}`);
          error.code = 'CHARACTER_AFTER_QUOTE';
          error.row = rows.length + 1;
          throw error;
        }
      } else if (char === '"') {
        if (field.length) {
          const error = new Error(`Comilla inesperada en la fila ${rows.length + 1}`);
          error.code = 'UNEXPECTED_QUOTE';
          error.row = rows.length + 1;
          throw error;
        }
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }

    if (quoted) {
      const error = new Error(`CSV con comilla sin cerrar en la fila ${rows.length + 1}`);
      error.code = 'UNCLOSED_QUOTE';
      error.row = rows.length + 1;
      throw error;
    }

    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function parseCatalogShape(input) {
    const rows = parseCsvStrict(input);
    const header = rows[0] || [];
    if (header.length !== CATALOG_HEADER.length || header.some((field, index) => field !== CATALOG_HEADER[index])) {
      const error = new Error(`Cabecera inválida: se esperaba ${CATALOG_HEADER.join(',')}`);
      error.code = 'INVALID_HEADER';
      throw error;
    }
    const dataRows = rows.slice(1);
    dataRows.forEach((row, index) => {
      if (row.length !== CATALOG_HEADER.length) {
        const error = new Error(`Fila ${index + 2} con ${row.length} campos; se esperaban ${CATALOG_HEADER.length}`);
        error.code = 'INVALID_ROW_WIDTH';
        error.row = index + 2;
        throw error;
      }
    });
    return rows;
  }

  function validateCatalogText(input, options) {
    const minimumRows = options && Number.isInteger(options.minimumRows) ? options.minimumRows : 1;
    const dataRows = parseCatalogShape(input).slice(1);
    const ids = new Set();
    const links = new Set();
    dataRows.forEach((row, index) => {
      const rowNumber = index + 2;
      const id = row[0].trim();
      if (!id) {
        const error = new Error(`Fila ${rowNumber} sin ID`);
        error.code = 'EMPTY_ID';
        error.row = rowNumber;
        throw error;
      }
      if (ids.has(id)) {
        const error = new Error(`ID duplicado en la fila ${rowNumber}: ${id}`);
        error.code = 'DUPLICATE_ID';
        error.row = rowNumber;
        throw error;
      }
      ids.add(id);
      if (!row[2].trim()) {
        const error = new Error(`Campo title vacío en la fila ${rowNumber}`);
        error.code = 'EMPTY_REQUIRED_FIELD';
        error.row = rowNumber;
        error.field = 'title';
        throw error;
      }
      const link = row[5].trim();
      [['link', link], ['thumb', row[7].trim()]].forEach(([fieldName, value]) => {
        if (!value) return;
        let url;
        try {
          url = new URL(value);
        } catch (cause) {
          url = null;
        }
        if (!url || !['http:', 'https:'].includes(url.protocol) || !url.hostname) {
          const error = new Error(`URL inválida en ${fieldName}, fila ${rowNumber}: ${value}`);
          error.code = 'INVALID_URL';
          error.row = rowNumber;
          error.field = fieldName;
          throw error;
        }
      });
      if (link && links.has(link)) {
        const error = new Error(`Enlace duplicado en la fila ${rowNumber}: ${link}`);
        error.code = 'DUPLICATE_LINK';
        error.row = rowNumber;
        throw error;
      }
      if (link) links.add(link);
    });
    if (dataRows.length < minimumRows) {
      const error = new Error(`Catálogo con ${dataRows.length} filas; se esperaban al menos ${minimumRows}`);
      error.code = 'ROW_COUNT_BELOW_MINIMUM';
      throw error;
    }
    return {
      rows: dataRows,
      stats: {
        rowCount: dataRows.length,
        uniqueIdCount: ids.size,
        uniqueLinkCount: links.size,
        emptyLinkCount: dataRows.length - links.size,
      },
    };
  }

  function createCatalogIncident(state, context) {
    const currentState = state || {};
    const details = context || {};
    const clean = (value, fallback, maximum) => {
      const text = String(value == null ? '' : value).trim();
      return (text || fallback).slice(0, maximum);
    };
    const error = currentState.error || {};
    const status = Number(error.status);
    return Object.freeze({
      incidentId: clean(details.incidentId, 'catalog-unknown', 100),
      version: clean(details.version, 'unknown', 40),
      workspaceId: clean(details.workspaceId, 'anonymous', 100),
      occurredAt: clean(details.occurredAt, new Date(0).toISOString(), 40),
      status: clean(currentState.status, 'unknown', 20),
      httpStatus: Number.isInteger(status) ? status : null,
      attempt: Number.isInteger(currentState.attempts) ? currentState.attempts : 0,
      online: details.online === true,
      errorCode: clean(error.code, 'UNKNOWN', 60),
    });
  }

  function createCatalogLoader(options) {
    const config = options || {};
    const fetchImpl = config.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchImpl) throw new Error('createCatalogLoader requiere fetch');
    const maxAttempts = Number.isInteger(config.maxAttempts) ? Math.max(1, config.maxAttempts) : 3;
    const baseDelayMs = Number.isFinite(config.baseDelayMs) ? Math.max(0, config.baseDelayMs) : 400;
    const random = typeof config.random === 'function' ? config.random : Math.random;
    const sleep = typeof config.sleep === 'function'
      ? config.sleep
      : milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    const timeoutMs = Number.isFinite(config.timeoutMs) ? Math.max(1, config.timeoutMs) : 8000;
    const setTimer = typeof config.setTimer === 'function' ? config.setTimer : setTimeout;
    const clearTimer = typeof config.clearTimer === 'function' ? config.clearTimer : clearTimeout;
    const AbortControllerImpl = config.AbortController || globalThis.AbortController;
    let current = { status: 'idle', attempts: 0 };
    let disposed = false;
    let activeController = null;
    let generation = 0;
    let lastUrl = '';
    const onlineTarget = config.onlineTarget
      || (typeof window !== 'undefined' && window.addEventListener ? window : null);

    function publish(next) {
      current = Object.freeze({ ...next });
      if (typeof config.onState === 'function') config.onState(current);
      return current;
    }

    async function load(url) {
      if (disposed) throw new Error('El cargador fue descartado');
      lastUrl = url;
      const loadGeneration = ++generation;
      if (activeController) activeController.abort();
      publish({ status: 'loading', attempts: 0, url });
      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (disposed || loadGeneration !== generation) {
          return Object.freeze({ status: 'cancelled', attempts: attempt - 1, url, error: lastError });
        }
        const controller = new AbortControllerImpl();
        activeController = controller;
        const timeout = setTimer(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(url, { cache: 'no-cache', signal: controller.signal });
          if (loadGeneration !== generation) return Object.freeze({ status: 'cancelled', attempts: attempt, url });
          if (!response || !response.ok) {
            const httpError = new Error(`HTTP ${response ? response.status : 'sin respuesta'}`);
            httpError.code = 'HTTP_ERROR';
            httpError.status = response && Number.isInteger(response.status) ? response.status : null;
            throw httpError;
          }
          const text = await response.text();
          if (loadGeneration !== generation) return Object.freeze({ status: 'cancelled', attempts: attempt, url });
          const validation = validateCatalogText(text, { minimumRows: config.minimumRows || 1 });
          return publish({ status: 'ready', attempts: attempt, url, text, stats: validation.stats });
        } catch (error) {
          if (loadGeneration !== generation) return Object.freeze({ status: 'cancelled', attempts: attempt, url, error });
          lastError = error;
          if (attempt < maxAttempts) {
            const backoff = baseDelayMs * (2 ** (attempt - 1));
            const jitter = Math.floor(random() * baseDelayMs);
            await sleep(backoff + jitter);
            if (disposed || loadGeneration !== generation) {
              return Object.freeze({ status: 'cancelled', attempts: attempt, url, error: lastError });
            }
          }
        } finally {
          clearTimer(timeout);
          if (activeController === controller) activeController = null;
        }
      }
      return publish({ status: 'degraded', attempts: maxAttempts, url, error: lastError });
    }

    const handleOnline = () => (current.status === 'degraded' && lastUrl ? load(lastUrl) : Promise.resolve(current));
    if (onlineTarget) onlineTarget.addEventListener('online', handleOnline);

    return {
      load,
      state: () => current,
      dispose() {
        disposed = true;
        generation += 1;
        if (activeController) activeController.abort();
        if (onlineTarget) onlineTarget.removeEventListener('online', handleOnline);
      },
    };
  }

  function migrateLegacyReferenceKeys(input) {
    const references = Array.isArray(input && input.references) ? input.references : [];
    const sourceLaunches = Array.isArray(input && input.launches) ? input.launches : [];
    const sourceUsage = input && input.usage && typeof input.usage === 'object' ? input.usage : {};
    const candidatesByLegacyKey = new Map();
    references.forEach(reference => {
      const id = String(reference && reference.id || '').trim();
      const title = String(reference && reference.title || '').trim().toLowerCase();
      if (!id || !title) return;
      const legacyKey = `t:${title}`;
      if (!candidatesByLegacyKey.has(legacyKey)) candidatesByLegacyKey.set(legacyKey, []);
      candidatesByLegacyKey.get(legacyKey).push(reference);
    });

    function resolveKey(oldKey, snapshot) {
      const candidates = candidatesByLegacyKey.get(oldKey) || [];
      if (!candidates.length) return null;
      const snapshotLink = String(snapshot && snapshot.link || '').trim();
      const snapshotHook = String(snapshot && snapshot.hook || '').trim();
      const match = (snapshotLink && candidates.find(reference => String(reference.link || '').trim() === snapshotLink))
        || (snapshotHook && candidates.find(reference => String(reference.hook || '').trim() === snapshotHook))
        || candidates[0];
      return `id:${String(match.id).trim()}`;
    }

    let changes = 0;
    const launches = sourceLaunches.map(launch => {
      if (!Array.isArray(launch && launch.ideas)) return launch;
      let launchChanged = false;
      const ideas = launch.ideas.map(idea => {
        const nextKey = resolveKey(idea && idea.key, idea);
        if (!nextKey || nextKey === idea.key) return idea;
        changes += 1;
        launchChanged = true;
        return { ...idea, key: nextKey };
      });
      return launchChanged ? { ...launch, ideas } : launch;
    });

    const usage = { ...sourceUsage };
    Object.keys(sourceUsage).forEach(oldKey => {
      // El contador legacy no guardaba snapshot; para títulos duplicados se conserva
      // determinísticamente en la primera referencia, sin duplicar ni perder el total.
      const nextKey = resolveKey(oldKey, null);
      if (!nextKey) return;
      const oldCount = Number(sourceUsage[oldKey]) || 0;
      const nextCount = Number(usage[nextKey]) || 0;
      usage[nextKey] = nextCount + oldCount;
      delete usage[oldKey];
      changes += 1;
    });
    return { launches, usage, changes };
  }

  return {
    CATALOG_HEADER,
    CATALOG_MINIMUM_ROWS,
    createCatalogIncident,
    createCatalogLoader,
    migrateLegacyReferenceKeys,
    parseCatalogShape,
    parseCsvStrict,
    validateCatalogText,
  };
});
