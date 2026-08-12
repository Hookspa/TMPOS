const fs = require('node:fs');
const path = require('node:path');

const {
  createDeployIncident,
  verifyCurrentProduction,
  verifyRemoteDeployment,
} = require('./deploy-contract.js');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = argument('base-url', process.env.DEPLOY_BASE_URL);
const expectedCommit = argument('expected-commit', process.env.GITHUB_SHA);
const expectedRoot = path.resolve(argument('expected-root', path.resolve(__dirname, '../..')));
const incidentPath = argument('incident', '');
const attempts = Number(argument('attempts', '8'));
const delayMs = Number(argument('delay-ms', '5000'));
const preflight = process.argv.includes('--preflight');

if (!baseUrl || !expectedCommit) {
  throw new Error('Uso: canary.js --base-url URL --expected-commit SHA [--expected-root DIR]');
}

const verification = preflight ? verifyCurrentProduction : verifyRemoteDeployment;
verification({ baseUrl, expectedCommit, expectedRoot, attempts, delayMs })
  .then(result => {
    console.log(
      `${preflight ? 'Preflight' : 'Canary HTTP'} listo: ${result.commit} · ${result.rowCount} referencias · ${result.catalogSha256}`,
    );
  })
  .catch(error => {
    if (incidentPath) {
      const incident = createDeployIncident({
        incidentId: `deploy-${process.env.GITHUB_RUN_ID || 'local'}`,
        commit: expectedCommit,
        workflowRun: process.env.GITHUB_RUN_ID,
        cause: error.code || 'CANARY_FAILED',
        state: 'requires-intervention',
      });
      fs.mkdirSync(path.dirname(path.resolve(incidentPath)), { recursive: true });
      fs.writeFileSync(path.resolve(incidentPath), `${JSON.stringify(incident, null, 2)}\n`, 'utf8');
    }
    console.error(`Canary HTTP falló: ${error.code || 'UNKNOWN'} · ${error.message}`);
    process.exitCode = 1;
  });
