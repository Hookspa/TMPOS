const crypto = require('node:crypto');

const { CATALOG_HEADER, parseCatalogShape, validateCatalogText } = require('./catalog.js');
const EMBEDDED_ID_STRATEGY = Object.freeze({
  // Estrategia de migración única: una vez materializado en refs_02.csv, el ID se conserva
  // como dato fuente y nunca se recalcula al editar título, hook, tags o miniatura.
  name: 'materialized-sha256-content-v1',
  algorithm: 'sha256',
  hexLength: 20,
  prefix: 'embedded-',
});

function extractEmbeddedCatalog(html) {
  const match = String(html).match(/<script\b[^>]*\bid=["']bank-csv["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    const error = new Error('No se encontró #bank-csv en app.html');
    error.code = 'EMBEDDED_CATALOG_NOT_FOUND';
    throw error;
  }
  return match[1].trim();
}

function stableEmbeddedId(row) {
  const canonicalFields = row.slice(1).map(value => value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .normalize('NFC'));
  const digest = crypto.createHash(EMBEDDED_ID_STRATEGY.algorithm)
    .update(canonicalFields.join('\u001f'), 'utf8')
    .digest('hex');
  return `${EMBEDDED_ID_STRATEGY.prefix}${digest.slice(0, EMBEDDED_ID_STRATEGY.hexLength)}`;
}

function serializeCsv(rows) {
  const escapeField = value => {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `${rows.map(row => row.map(escapeField).join(',')).join('\n')}\n`;
}

function mergeCatalogSources(embeddedCsv, externalCsv, options) {
  const embeddedRows = parseCatalogShape(embeddedCsv);
  const externalRows = parseCatalogShape(externalCsv);

  const embeddedWithIds = embeddedRows.slice(1).map(row => {
    const copy = row.slice();
    if (!copy[0].trim()) copy[0] = stableEmbeddedId(copy);
    return copy;
  });
  const embeddedById = new Map(embeddedWithIds.map(row => [row[0].trim(), row]));
  const externalOnly = externalRows.slice(1).filter(row => {
    const embeddedRow = embeddedById.get(row[0].trim());
    if (!embeddedRow) return true;
    if (JSON.stringify(row) !== JSON.stringify(embeddedRow)) {
      const error = new Error(`El ID ${row[0].trim()} identifica contenidos distintos`);
      error.code = 'EMBEDDED_ID_COLLISION';
      throw error;
    }
    return false;
  });
  const csv = serializeCsv([CATALOG_HEADER, ...embeddedWithIds, ...externalOnly]);
  const validation = validateCatalogText(csv, options);

  return { csv, stats: validation.stats };
}

function createManifest(csv, stats) {
  return {
    formatVersion: 1,
    catalogFile: 'refs_02.csv',
    embeddedIdStrategy: EMBEDDED_ID_STRATEGY.name,
    externalIdStrategy: 'preserved-source-id',
    ...stats,
    sha256: crypto.createHash('sha256').update(csv, 'utf8').digest('hex'),
  };
}

function createCatalogArtifact(embeddedCsv, externalCsv, options) {
  const result = mergeCatalogSources(embeddedCsv, externalCsv, options);
  return {
    ...result,
    manifest: createManifest(result.csv, result.stats),
  };
}

function createCatalogArtifactFromCsv(csv, options) {
  const validation = validateCatalogText(csv, options);
  return { csv, stats: validation.stats, manifest: createManifest(csv, validation.stats) };
}

function assertCatalogManifest(csv, manifest, options) {
  const expected = createCatalogArtifactFromCsv(csv, options).manifest;
  if (JSON.stringify(expected) !== JSON.stringify(manifest)) {
    const error = new Error('El manifiesto no corresponde al contenido actual de refs_02.csv');
    error.code = 'CATALOG_MANIFEST_MISMATCH';
    throw error;
  }
  return expected;
}

module.exports = {
  assertCatalogManifest,
  createCatalogArtifact,
  createCatalogArtifactFromCsv,
  EMBEDDED_ID_STRATEGY,
  extractEmbeddedCatalog,
  mergeCatalogSources,
  serializeCsv,
  stableEmbeddedId,
};
