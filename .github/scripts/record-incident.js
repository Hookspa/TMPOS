const fs = require('node:fs');
const path = require('node:path');

const { createDeployIncident } = require('./deploy-contract.js');

const recoveryResult = process.env.RECOVERY_RESULT || 'skipped';
const deployResult = process.env.DEPLOY_RESULT || 'unknown';
const canaryResult = process.env.CANARY_RESULT || 'unknown';
const recoveryAttempted = recoveryResult !== 'skipped';
const state = recoveryResult === 'success' ? 'recovered-automatically' : 'requires-intervention';
const cause = deployResult === 'failure'
  ? 'DEPLOY_FAILED'
  : (deployResult === 'cancelled'
    ? 'DEPLOY_CANCELLED'
    : (canaryResult === 'cancelled' ? 'POST_DEPLOY_CANARY_CANCELLED' : 'POST_DEPLOY_CANARY_FAILED'));
const incident = createDeployIncident({
  incidentId: `deploy-${process.env.GITHUB_RUN_ID || 'local'}`,
  commit: process.env.GITHUB_SHA,
  workflowRun: process.env.GITHUB_RUN_ID,
  cause,
  state,
  recoveryAttempted,
  recoveryCommit: process.env.RECOVERY_COMMIT,
});
const destination = path.resolve(process.argv[2] || '_incident/deployment-incident.json');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(incident, null, 2)}\n`, 'utf8');

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## Incidente de despliegue',
    '',
    `- Estado: **${incident.state}**`,
    `- Versión: \`${incident.commit}\``,
    `- Recuperación intentada: **${incident.recoveryAttempted ? 'sí' : 'no'}**`,
    `- Versión recuperada: \`${incident.recoveryCommit}\``,
    '',
    'El diagnóstico completo y sanitizado está adjunto como `deployment-incident`.',
    '',
  ].join('\n');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
}
console.log(`Incidente registrado: ${incident.incidentId} · ${incident.state}`);
