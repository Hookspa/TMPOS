const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createCatalogIncident,
  createCatalogLoader,
  migrateLegacyReferenceKeys,
  parseCsvStrict,
  validateCatalogText,
} = require('../../js/catalog.js');
const {
  assertCatalogManifest,
  createCatalogArtifact,
  createCatalogArtifactFromCsv,
  extractEmbeddedCatalog,
  mergeCatalogSources,
  stableEmbeddedId,
} = require('../../js/catalog-build.js');

test('el catálogo interpreta comas, comillas y saltos de línea sin alterar campos', () => {
  const csv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    'ref-1,"Gancho, con coma","Título ""citado""",single,storytelling,https://example.com/video,"Línea 1\nLínea 2",https://example.com/thumb.jpg',
  ].join('\n');

  assert.deepEqual(parseCsvStrict(csv), [
    ['id', 'hook', 'title', 'for', 'cat', 'link', 'comentarios', 'thumb'],
    ['ref-1', 'Gancho, con coma', 'Título "citado"', 'single', 'storytelling', 'https://example.com/video', 'Línea 1\nLínea 2', 'https://example.com/thumb.jpg'],
  ]);
});

test('el cargador publica ready solo después de descargar y validar el catálogo', async () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,https://example.com/a,,https://example.com/a.jpg\n';
  const states = [];
  const loader = createCatalogLoader({
    fetch: async () => ({ ok: true, text: async () => csv }),
    minimumRows: 1,
    onState: state => states.push(state.status),
  });

  const result = await loader.load('refs_02.csv');

  assert.equal(result.status, 'ready');
  assert.equal(result.stats.rowCount, 1);
  assert.deepEqual(states, ['loading', 'ready']);
  assert.equal(loader.state().status, 'ready');
  loader.dispose();
});

test('el cargador reintenta con backoff controlado y termina en degraded', async () => {
  let calls = 0;
  const delays = [];
  const loader = createCatalogLoader({
    fetch: async () => { calls += 1; return { ok: false, status: 503 }; },
    maxAttempts: 3,
    baseDelayMs: 100,
    random: () => 0,
    sleep: async milliseconds => { delays.push(milliseconds); },
  });

  const result = await loader.load('refs_02.csv');

  assert.equal(result.status, 'degraded');
  assert.equal(result.attempts, 3);
  assert.equal(result.error.code, 'HTTP_ERROR');
  assert.equal(result.error.status, 503);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
  loader.dispose();
});

test('el diagnóstico técnico contiene contexto útil sin incluir el mensaje crudo', () => {
  const error = new Error('token-secreto-no-debe-salir');
  error.code = 'HTTP_ERROR';
  error.status = 503;

  const incident = createCatalogIncident({ status: 'degraded', attempts: 3, error }, {
    incidentId: 'cat-test-1',
    version: 'v0.78.0-alpha',
    workspaceId: 'workspace-1',
    occurredAt: '2026-08-11T15:00:00.000Z',
    online: false,
  });

  assert.deepEqual(incident, {
    incidentId: 'cat-test-1',
    version: 'v0.78.0-alpha',
    workspaceId: 'workspace-1',
    occurredAt: '2026-08-11T15:00:00.000Z',
    status: 'degraded',
    httpStatus: 503,
    attempt: 3,
    online: false,
    errorCode: 'HTTP_ERROR',
  });
  assert.doesNotMatch(JSON.stringify(incident), /token-secreto/);
});

test('el cargador aborta una descarga que supera el timeout', async () => {
  const loader = createCatalogLoader({
    fetch: async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('timeout abortado')), { once: true });
    }),
    maxAttempts: 1,
    timeoutMs: 10,
    setTimer: callback => { queueMicrotask(callback); return 1; },
    clearTimer: () => {},
  });

  const result = await loader.load('refs_02.csv');

  assert.equal(result.status, 'degraded');
  assert.match(result.error.message, /timeout abortado/);
  loader.dispose();
});

test('una carga nueva cancela la anterior sin degradar el estado final', { timeout: 1000 }, async () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,https://example.com/a,,https://example.com/a.jpg\n';
  const loader = createCatalogLoader({
    fetch: async (url, options) => {
      if (url === 'anterior.csv') {
        return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new Error('cancelada')), { once: true });
        });
      }
      return { ok: true, text: async () => csv };
    },
    maxAttempts: 1,
    minimumRows: 1,
  });

  const previous = loader.load('anterior.csv');
  await Promise.resolve();
  const latest = await loader.load('actual.csv');
  const cancelled = await previous;

  assert.equal(latest.status, 'ready');
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(loader.state().url, 'actual.csv');
  loader.dispose();
});

test('cancelar durante el backoff impide otro fetch de la carga obsoleta', async () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,https://example.com/a,,https://example.com/a.jpg\n';
  const calls = [];
  let releaseBackoff;
  const loader = createCatalogLoader({
    fetch: async url => {
      calls.push(url);
      return url === 'anterior.csv'
        ? { ok: false, status: 503 }
        : { ok: true, text: async () => csv };
    },
    maxAttempts: 2,
    minimumRows: 1,
    random: () => 0,
    sleep: () => new Promise(resolve => { releaseBackoff = resolve; }),
  });

  const previous = loader.load('anterior.csv');
  await Promise.resolve();
  await Promise.resolve();
  const latest = await loader.load('actual.csv');
  releaseBackoff();
  const cancelled = await previous;

  assert.equal(latest.status, 'ready');
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(calls, ['anterior.csv', 'actual.csv']);
  loader.dispose();
});

test('el cargador registra una sola reconexión y reintenta al volver online', async () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,https://example.com/a,,https://example.com/a.jpg\n';
  let online = false;
  const onlineTarget = {
    adds: 0,
    removes: 0,
    handler: null,
    addEventListener(type, handler) { this.adds += 1; this.handler = handler; },
    removeEventListener() { this.removes += 1; },
  };
  const loader = createCatalogLoader({
    fetch: async () => online
      ? { ok: true, text: async () => csv }
      : { ok: false, status: 503 },
    maxAttempts: 1,
    minimumRows: 1,
    onlineTarget,
  });

  assert.equal((await loader.load('refs_02.csv')).status, 'degraded');
  online = true;
  await onlineTarget.handler();

  assert.equal(loader.state().status, 'ready');
  assert.equal(onlineTarget.adds, 1);
  loader.dispose();
  assert.equal(onlineTarget.removes, 1);
});

test('la migración conserva selecciones y acumula su uso bajo el ID nuevo', () => {
  const references = [{ id: 'embedded-1', title: 'Mi Idea' }];
  const launches = [{ id: 'launch-1', ideas: [{ key: 't:mi idea', title: 'Mi Idea' }] }];
  const usage = { 't:mi idea': 2, 'id:embedded-1': 1 };

  const first = migrateLegacyReferenceKeys({ references, launches, usage });
  const second = migrateLegacyReferenceKeys({ references, launches: first.launches, usage: first.usage });

  assert.equal(first.launches[0].ideas[0].key, 'id:embedded-1');
  assert.deepEqual(first.usage, { 'id:embedded-1': 3 });
  assert.equal(first.changes, 2);
  assert.equal(second.changes, 0);
});

test('la migración usa el snapshot para resolver títulos legacy duplicados', () => {
  const references = [
    { id: 'embedded-a', title: 'Idea repetida', link: 'https://example.com/a', hook: 'Primera' },
    { id: 'embedded-b', title: 'Idea repetida', link: 'https://example.com/b', hook: 'Segunda' },
  ];
  const launches = [{
    id: 'launch-1',
    ideas: [{ key: 't:idea repetida', title: 'Idea repetida', link: 'https://example.com/b', hook: 'Segunda' }],
  }];

  const result = migrateLegacyReferenceKeys({ references, launches, usage: {} });

  assert.equal(result.launches[0].ideas[0].key, 'id:embedded-b');
});

test('el catálogo rechaza una comilla sin cerrar e indica la fila afectada', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,"Gancho abierto';

  assert.throws(
    () => parseCsvStrict(csv),
    error => error.code === 'UNCLOSED_QUOTE' && error.row === 2,
  );
});

test('el catálogo rechaza comillas que aparecen dentro de un campo no citado', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho"roto,Título,single,storytelling,https://example.com/video,,https://example.com/thumb.jpg';

  assert.throws(
    () => parseCsvStrict(csv),
    error => error.code === 'UNEXPECTED_QUOTE' && error.row === 2,
  );
});

test('el catálogo rechaza caracteres después de cerrar un campo citado', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,"Gancho"roto,Título,single,storytelling,https://example.com/video,,https://example.com/thumb.jpg';

  assert.throws(
    () => parseCsvStrict(csv),
    error => error.code === 'CHARACTER_AFTER_QUOTE' && error.row === 2,
  );
});

test('el validador exige la cabecera canónica completa y en el orden acordado', () => {
  const csv = 'id,title,hook,for,cat,link,comentarios,thumb\nref-1,Título,Gancho,single,storytelling,https://example.com/video,,https://example.com/thumb.jpg';

  assert.throws(
    () => validateCatalogText(csv),
    error => error.code === 'INVALID_HEADER',
  );
});

test('el validador rechaza filas truncadas y señala su número', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,https://example.com/video';

  assert.throws(
    () => validateCatalogText(csv),
    error => error.code === 'INVALID_ROW_WIDTH' && error.row === 2,
  );
});

test('el validador exige un ID estable y único para cada referencia', () => {
  const csv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    'ref-1,Gancho,Título A,single,storytelling,https://example.com/a,,https://example.com/a.jpg',
    'ref-1,Gancho,Título B,single,storytelling,https://example.com/b,,https://example.com/b.jpg',
  ].join('\n');

  assert.throws(
    () => validateCatalogText(csv),
    error => error.code === 'DUPLICATE_ID' && error.row === 3,
  );
});

test('el validador rechaza referencias sin título porque el Banco no puede mostrarlas', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,,single,storytelling,https://example.com/a,,https://example.com/a.jpg';

  assert.throws(
    () => validateCatalogText(csv),
    error => error.code === 'EMPTY_REQUIRED_FIELD' && error.row === 2 && error.field === 'title',
  );
});

test('el validador permite enlaces vacíos pero rechaza enlaces repetidos', () => {
  const csv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    'ref-1,Gancho,Título A,single,storytelling,https://example.com/a,,https://example.com/a.jpg',
    'ref-2,Gancho,Título B,single,storytelling,https://example.com/a,,https://example.com/b.jpg',
  ].join('\n');

  assert.throws(
    () => validateCatalogText(csv),
    error => error.code === 'DUPLICATE_LINK' && error.row === 3,
  );
});

test('el validador acepta solo URLs HTTP o HTTPS en enlace y miniatura', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,javascript:alert(1),,https://example.com/thumb.jpg';

  assert.throws(
    () => validateCatalogText(csv),
    error => error.code === 'INVALID_URL' && error.row === 2 && error.field === 'link',
  );
});

test('el validador informa conteos verificables y respeta el mínimo esperado', () => {
  const csv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    'ref-1,Gancho,Título A,single,storytelling,https://example.com/a,,https://example.com/a.jpg',
    'ref-2,Gancho,Título B,single,storytelling,,,https://example.com/b.jpg',
  ].join('\n');

  assert.deepEqual(validateCatalogText(csv, { minimumRows: 2 }).stats, {
    rowCount: 2,
    uniqueIdCount: 2,
    uniqueLinkCount: 1,
    emptyLinkCount: 1,
  });
  assert.throws(
    () => validateCatalogText(csv, { minimumRows: 3 }),
    error => error.code === 'ROW_COUNT_BELOW_MINIMUM',
  );
});

test('la fusión antepone las referencias embebidas, les da IDs estables y preserva sus campos', () => {
  const embeddedCsv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    ',Gancho,Título embebido,single,storytelling,https://example.com/e,,https://example.com/e.jpg',
  ].join('\n');
  const externalCsv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    'external-1,Otro,Título externo,album,performance,https://example.com/x,Nota,https://example.com/x.jpg',
  ].join('\n');

  const result = mergeCatalogSources(embeddedCsv, externalCsv);

  assert.deepEqual(parseCsvStrict(result.csv), [
    ['id', 'hook', 'title', 'for', 'cat', 'link', 'comentarios', 'thumb'],
    ['embedded-6bc94190c12ac02b1d91', 'Gancho', 'Título embebido', 'single', 'storytelling', 'https://example.com/e', '', 'https://example.com/e.jpg'],
    ['external-1', 'Otro', 'Título externo', 'album', 'performance', 'https://example.com/x', 'Nota', 'https://example.com/x.jpg'],
  ]);
});

test('los IDs tratan texto Unicode equivalente como la misma referencia', () => {
  const composed = ['', 'Gancho', 'Café 🎵', 'single', 'storytelling', '', '', ''];
  const decomposed = ['', 'Gancho', 'Cafe\u0301 🎵', 'single', 'storytelling', '', '', ''];

  assert.equal(stableEmbeddedId(composed), stableEmbeddedId(decomposed));
});

test('repetir la fusión produce exactamente el mismo catálogo', () => {
  const embeddedCsv = 'id,hook,title,for,cat,link,comentarios,thumb\n,Gancho,Título embebido,single,storytelling,https://example.com/e,,https://example.com/e.jpg';
  const externalCsv = 'id,hook,title,for,cat,link,comentarios,thumb\nexternal-1,Otro,Título externo,album,performance,https://example.com/x,Nota,https://example.com/x.jpg';
  const first = mergeCatalogSources(embeddedCsv, externalCsv).csv;

  assert.equal(mergeCatalogSources(embeddedCsv, first).csv, first);
});

test('la fusión rechaza una colisión de ID si el contenido no es la misma referencia', () => {
  const embeddedCsv = 'id,hook,title,for,cat,link,comentarios,thumb\n,Gancho,Título embebido,single,storytelling,https://example.com/e,,https://example.com/e.jpg';
  const conflictingCsv = 'id,hook,title,for,cat,link,comentarios,thumb\nembedded-6bc94190c12ac02b1d91,Distinto,Otra referencia,album,performance,https://example.com/x,,https://example.com/x.jpg';

  assert.throws(
    () => mergeCatalogSources(embeddedCsv, conflictingCsv),
    error => error.code === 'EMBEDDED_ID_COLLISION',
  );
});

test('el artefacto genera un manifiesto reproducible con conteos y SHA-256', () => {
  const embeddedCsv = 'id,hook,title,for,cat,link,comentarios,thumb\n,Gancho,Título embebido,single,storytelling,https://example.com/e,,https://example.com/e.jpg';
  const externalCsv = 'id,hook,title,for,cat,link,comentarios,thumb\nexternal-1,Otro,Título externo,album,performance,https://example.com/x,Nota,https://example.com/x.jpg';

  assert.deepEqual(createCatalogArtifact(embeddedCsv, externalCsv).manifest, {
    formatVersion: 1,
    catalogFile: 'refs_02.csv',
    embeddedIdStrategy: 'materialized-sha256-content-v1',
    externalIdStrategy: 'preserved-source-id',
    rowCount: 2,
    uniqueIdCount: 2,
    uniqueLinkCount: 2,
    emptyLinkCount: 0,
    sha256: 'fdf0d83cbaac2c3c60da47784ea4828228fcc095e2337f760886b3fedbbf7170',
  });
});

test('el artefacto puede validarse después de retirar el CSV embebido de app.html', () => {
  const combinedCsv = [
    'id,hook,title,for,cat,link,comentarios,thumb',
    'ref-1,Gancho,Título A,single,storytelling,https://example.com/a,,https://example.com/a.jpg',
    'ref-2,Otro,Título B,album,performance,https://example.com/b,Nota,https://example.com/b.jpg',
    '',
  ].join('\n');

  const artifact = createCatalogArtifactFromCsv(combinedCsv, { minimumRows: 2 });

  assert.equal(artifact.csv, combinedCsv);
  assert.equal(artifact.manifest.rowCount, 2);
});

test('la comprobación detecta cambios de contenido aunque los conteos no cambien', () => {
  const csv = 'id,hook,title,for,cat,link,comentarios,thumb\nref-1,Gancho,Título,single,storytelling,https://example.com/a,,https://example.com/a.jpg\n';
  const manifest = createCatalogArtifactFromCsv(csv).manifest;

  assert.throws(
    () => assertCatalogManifest(csv.replace('Título', 'Título corregido'), manifest),
    error => error.code === 'CATALOG_MANIFEST_MISMATCH',
  );
});

test('el shell usa assets externos y respeta los presupuestos de tamaño', () => {
  const root = path.resolve(__dirname, '../..');
  const htmlPath = path.join(root, 'app.html');
  const cssPath = path.join(root, 'css/app.css');
  const catalogPath = path.join(root, 'refs_02.csv');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const expectedAssets = [
    'logo_exports/tempo-mark-orange.svg',
    'logo_exports/favicon-32.png',
    'logo_exports/favicon-16.png',
    'logo_exports/favicon.ico',
    'logo_exports/favicon-180.png',
  ];

  assert.doesNotMatch(html, /href=["']data:image\//i);
  expectedAssets.forEach(asset => {
    assert.match(html, new RegExp(`href=["']${asset.replaceAll('.', '\\.')}["']`));
    assert.ok(fs.statSync(path.join(root, asset)).size > 0, `${asset} debe existir y tener contenido`);
  });
  assert.match(html, /<meta name=["']theme-color["'] content=["']#0a0a0a["']>/);
  assert.ok(fs.statSync(htmlPath).size <= 100 * 1024, 'app.html excede 100 KiB');
  assert.ok(fs.statSync(cssPath).size <= 115 * 1024, 'css/app.css excede 115 KiB');
  assert.ok(fs.statSync(catalogPath).size <= 2 * 1024 * 1024, 'refs_02.csv excede 2 MiB');
});

test('el catálogo canónico conserva las 6,066 referencias y app.html ya no contiene una copia', () => {
  const root = path.resolve(__dirname, '../..');
  const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
  const catalogCsv = fs.readFileSync(path.join(root, 'refs_02.csv'), 'utf8');
  const artifact = createCatalogArtifactFromCsv(catalogCsv, { minimumRows: 6066 });
  const rows = parseCsvStrict(artifact.csv);

  assert.doesNotMatch(html, /id=["']bank-csv["']/);
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.match(html, /href=["']css\/app\.css\?v=20260811a["']/);
  assert.match(css, /:root, \[data-theme="dark"\]/);
  assert.match(css, /\.catalog-state/);
  const scriptVersions = { catalog: '20260811c', plan: '20260902d', app: '20260902t', releases: '20260903a', team: '20260811b', init: '20260811b' };
  Object.entries(scriptVersions).forEach(([script, version]) => {
    assert.match(html, new RegExp(`src=["']js/${script}\\.js\\?v=${version}["']`));
  });
  assert.deepEqual(artifact.stats, {
    rowCount: 6066,
    uniqueIdCount: 6066,
    uniqueLinkCount: 6044,
    emptyLinkCount: 22,
  });
  assert.equal(rows[1][2], 'Detrás de Cámaras: Mi Trayectoria Profesional');
  assert.equal(rows[543][0], 'ig-DH-ChLQqwxS');
});
