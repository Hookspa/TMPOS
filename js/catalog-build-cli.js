const fs = require('node:fs');
const path = require('node:path');

const { createCatalogArtifactFromCsv } = require('./catalog-build.js');
const { CATALOG_MINIMUM_ROWS } = require('./catalog.js');

const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'refs_02.csv');
const manifestPath = path.join(root, 'js', 'catalog-manifest.js');

function renderManifest(manifest) {
  const json = JSON.stringify(manifest, null, 2);
  return `(function exposeCatalogManifest(root, value) {\n`
    + `  const manifest = Object.freeze(value);\n`
    + `  if (typeof module === 'object' && module.exports) module.exports = manifest;\n`
    + `  else if (root) root.TempoCatalogManifest = manifest;\n`
    + `})(typeof globalThis !== 'undefined' ? globalThis : this, ${json});\n`;
}

function buildExpectedArtifact() {
  const csv = fs.readFileSync(catalogPath, 'utf8');
  const artifact = createCatalogArtifactFromCsv(csv, { minimumRows: CATALOG_MINIMUM_ROWS });
  return { ...artifact, manifestSource: renderManifest(artifact.manifest) };
}

function checkArtifact(artifact) {
  const currentManifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  if (currentManifest !== artifact.manifestSource) {
    throw new Error('Manifiesto desactualizado. Ejecuta npm run catalog:manifest.');
  }
}

const artifact = buildExpectedArtifact();
if (process.argv.includes('--check')) {
  checkArtifact(artifact);
  console.log(`Catálogo verificado: ${artifact.stats.rowCount} filas · ${artifact.stats.uniqueLinkCount} enlaces · ${artifact.manifest.sha256}`);
} else if (process.argv.includes('--write')) {
  const temporaryManifestPath = `${manifestPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryManifestPath, artifact.manifestSource, 'utf8');
    fs.renameSync(temporaryManifestPath, manifestPath);
  } finally {
    if (fs.existsSync(temporaryManifestPath)) fs.unlinkSync(temporaryManifestPath);
  }
  console.log(`Manifiesto actualizado: ${artifact.stats.rowCount} filas · ${artifact.stats.uniqueLinkCount} enlaces · ${artifact.manifest.sha256}`);
} else {
  throw new Error('Uso: node js/catalog-build-cli.js --check|--write');
}
