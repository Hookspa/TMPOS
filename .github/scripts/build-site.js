const path = require('node:path');

const { buildSite } = require('./deploy-contract.js');

const root = path.resolve(__dirname, '../..');
const destination = path.resolve(process.env.DEPLOY_OUTPUT_DIR || path.join(root, '_site'));
const commit = process.env.DEPLOY_COMMIT || process.env.GITHUB_SHA || process.argv[2] || 'local-verification';
const manifest = buildSite({ root, destination, commit });

console.log(
  `Artefacto preparado: ${manifest.files.length} archivos · `
  + `${manifest.catalog.rowCount} referencias · ${manifest.commit}`,
);
console.log(`Destino: ${destination}`);
