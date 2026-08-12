const fs = require('node:fs');

const { resolveCurrentProductionCommit } = require('./deploy-contract.js');

async function run() {
  const result = await resolveCurrentProductionCommit({
    baseUrl: process.env.DEPLOY_BASE_URL,
    fallbackCommit: process.env.PREFLIGHT_FALLBACK_SHA,
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT no está disponible');
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `head_sha=${result.commit}\nsource=${result.source}\n`,
    'utf8',
  );
  console.log(`Producción actual resuelta desde ${result.source}: ${result.commit}`);
}

run().catch(error => {
  console.error(`No se pudo resolver producción: ${error.code || 'UNKNOWN'} · ${error.message}`);
  process.exitCode = 1;
});
