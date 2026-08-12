const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  findLastKnownGood,
  writeGithubOutput,
} = require('../../.github/scripts/find-last-known-good.js');

const sha = character => character.repeat(40);

function apiResponse(workflowRuns, status = 200) {
  return new Response(JSON.stringify({ workflow_runs: workflowRuns }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jobsResponse(jobs, status = 200) {
  return new Response(JSON.stringify({ jobs }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('elige un commit inmutable de un workflow anterior exitoso en main', async () => {
  const requestedUrls = [];
  const candidate = await findLastKnownGood({
    repository: 'Hookspa/TMPOS',
    token: 'test-token',
    currentRunId: '300',
    fetch: async input => {
      const requestedUrl = String(input);
      requestedUrls.push(requestedUrl);
      if (requestedUrl.includes('/jobs')) return jobsResponse([{ name: 'canary', conclusion: 'success' }]);
      return apiResponse([
        { id: 300, conclusion: 'success', head_branch: 'main', event: 'push', head_sha: sha('a') },
        { id: 299, conclusion: 'success', head_branch: 'feature', event: 'workflow_dispatch', head_sha: sha('b') },
        { id: 298, conclusion: 'success', head_branch: 'main', event: 'pull_request', head_sha: sha('c') },
        { id: 297, conclusion: 'success', head_branch: 'main', event: 'push', head_sha: sha('d') },
      ]);
    },
  });

  assert.deepEqual(candidate, { runId: '297', headSha: sha('d') });
  assert.ok(requestedUrls.some(url => /branch=main/.test(url)));
  assert.ok(requestedUrls.some(url => /\/runs\/297\/jobs\?per_page=100/.test(url)));
});

test('ignora workflows exitosos cuya publicación no tuvo un canary exitoso', async () => {
  const candidate = await findLastKnownGood({
    repository: 'Hookspa/TMPOS',
    token: 'x',
    fetch: async input => {
      const url = String(input);
      if (url.includes('/runs/20/jobs')) return jobsResponse([{ name: 'canary', conclusion: 'skipped' }]);
      if (url.includes('/runs/19/jobs')) return jobsResponse([{ name: 'canary', conclusion: 'success' }]);
      return apiResponse([
        { id: 20, conclusion: 'success', head_branch: 'main', event: 'push', head_sha: sha('a') },
        { id: 19, conclusion: 'success', head_branch: 'main', event: 'push', head_sha: sha('b') },
      ]);
    },
  });
  assert.deepEqual(candidate, { runId: '19', headSha: sha('b') });
});

test('usa únicamente el fallback que el preflight entregó como SHA completa', async () => {
  const candidate = await findLastKnownGood({
    repository: 'Hookspa/TMPOS',
    token: 'x',
    fallbackCommit: sha('f'),
    fetch: async () => apiResponse([]),
  });
  assert.deepEqual(candidate, { runId: 'preflight-bootstrap', headSha: sha('f') });
});

test('rechaza contexto ausente, API fallida y lista sin candidato', async () => {
  await assert.rejects(findLastKnownGood({}), error => error.code === 'LKG_CONTEXT_MISSING');
  await assert.rejects(findLastKnownGood({
    repository: 'Hookspa/TMPOS', token: 'x', fetch: async () => apiResponse([], 403),
  }), error => error.code === 'LKG_API_ERROR' && error.status === 403);
  await assert.rejects(findLastKnownGood({
    repository: 'Hookspa/TMPOS', token: 'x', fetch: async () => apiResponse([]),
  }), error => error.code === 'LKG_NOT_FOUND');
});

test('acota una API colgada y reintenta fallos transitorios', async () => {
  await assert.rejects(findLastKnownGood({
    repository: 'Hookspa/TMPOS',
    token: 'x',
    apiAttempts: 1,
    fetchTimeoutMs: 10,
    fetch: (_input, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  }), error => error.code === 'LKG_API_TIMEOUT' && error.attempts === 1);

  let calls = 0;
  const delays = [];
  const candidate = await findLastKnownGood({
    repository: 'Hookspa/TMPOS',
    token: 'x',
    apiDelayMs: 25,
    sleep: async milliseconds => { delays.push(milliseconds); },
    fetch: async input => {
      if (String(input).includes('/jobs')) return jobsResponse([{ name: 'canary', conclusion: 'success' }]);
      calls += 1;
      if (calls === 1) return apiResponse([], 503);
      return apiResponse([
        { id: 10, conclusion: 'success', head_branch: 'main', event: 'push', head_sha: sha('a') },
      ]);
    },
  });
  assert.equal(candidate.runId, '10');
  assert.deepEqual(delays, [25]);
});

test('escribe outputs de recuperación sin incluir secretos', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'artistos-lkg-'));
  const output = path.join(directory, 'github-output');
  try {
    writeGithubOutput(output, { runId: '123', headSha: sha('e') });
    assert.equal(fs.readFileSync(output, 'utf8'), `run_id=123\nhead_sha=${sha('e')}\n`);
    assert.throws(() => writeGithubOutput('', { runId: '1', headSha: sha('f') }), error => (
      error.code === 'LKG_OUTPUT_MISSING'
    ));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
