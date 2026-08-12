const fs = require('node:fs');

function cleanSha(value) {
  const sha = String(value || '').trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : '';
}

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController();
  const deadlineMs = Math.max(1, Number(timeoutMs) || 10_000);
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`GitHub Actions excedió ${deadlineMs} ms`);
      error.code = 'LKG_API_TIMEOUT';
      reject(error);
      controller.abort();
    }, deadlineMs);
  });
  try {
    return await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function requestWorkflowRuns(options, url, headers) {
  const attempts = Math.max(1, Number(options.apiAttempts) || 3);
  const delayMs = Math.max(0, Number(options.apiDelayMs) || 500);
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchWithTimeout(options.fetch, url, { headers }, options.fetchTimeoutMs);
    } catch (error) {
      lastError = error;
    }
    if (response && response.ok) return response;
    if (response) {
      lastError = new Error(`GitHub Actions respondió HTTP ${response.status}`);
      lastError.code = 'LKG_API_ERROR';
      lastError.status = response.status;
      if (response.status < 500) throw lastError;
    }
    if (attempt < attempts) await sleep(delayMs * attempt);
  }
  lastError.attempts = attempts;
  throw lastError;
}

async function findLastKnownGood(options) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const repository = String(options.repository || '').trim();
  const token = String(options.token || '').trim();
  const workflow = String(options.workflow || 'deploy-pages.yml').trim();
  const currentRunId = String(options.currentRunId || '').trim();
  const fallbackCommit = cleanSha(options.fallbackCommit);
  const apiUrl = String(options.apiUrl || 'https://api.github.com').replace(/\/$/, '');
  if (!fetchImpl || !repository || !token) {
    const error = new Error('La búsqueda LKG requiere fetch, repositorio y token');
    error.code = 'LKG_CONTEXT_MISSING';
    throw error;
  }

  const url = new URL(`${apiUrl}/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/runs`);
  url.searchParams.set('branch', 'main');
  url.searchParams.set('status', 'success');
  url.searchParams.set('per_page', '100');
  const response = await requestWorkflowRuns({ ...options, fetch: fetchImpl }, url, {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  });
  const payload = await response.json();
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  const eligibleRuns = runs.filter(run => (
    String(run.id) !== currentRunId
    && run.conclusion === 'success'
    && run.head_branch === 'main'
    && ['push', 'workflow_dispatch'].includes(run.event)
    && cleanSha(run.head_sha)
  ));
  let candidate;
  for (const run of eligibleRuns) {
    const jobsUrl = new URL(`${apiUrl}/repos/${repository}/actions/runs/${run.id}/jobs`);
    jobsUrl.searchParams.set('per_page', '100');
    const jobsResponse = await requestWorkflowRuns({ ...options, fetch: fetchImpl }, jobsUrl, {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    });
    const jobsPayload = await jobsResponse.json();
    const jobs = Array.isArray(jobsPayload.jobs) ? jobsPayload.jobs : [];
    if (jobs.some(job => job.name === 'canary' && job.conclusion === 'success')) {
      candidate = run;
      break;
    }
  }
  if (!candidate) {
    if (fallbackCommit) return Object.freeze({ runId: 'preflight-bootstrap', headSha: fallbackCommit });
    const error = new Error('No existe todavía un despliegue anterior verificado');
    error.code = 'LKG_NOT_FOUND';
    throw error;
  }
  return Object.freeze({ runId: String(candidate.id), headSha: cleanSha(candidate.head_sha) });
}

function writeGithubOutput(outputPath, candidate) {
  if (!outputPath) {
    const error = new Error('GITHUB_OUTPUT no está disponible');
    error.code = 'LKG_OUTPUT_MISSING';
    throw error;
  }
  fs.appendFileSync(outputPath, `run_id=${candidate.runId}\nhead_sha=${candidate.headSha}\n`, 'utf8');
}

async function runFromEnvironment() {
  const candidate = await findLastKnownGood({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    workflow: process.env.GITHUB_WORKFLOW_REF
      ? process.env.GITHUB_WORKFLOW_REF.split('/.github/workflows/')[1].split('@')[0]
      : 'deploy-pages.yml',
    currentRunId: process.env.GITHUB_RUN_ID,
    apiUrl: process.env.GITHUB_API_URL,
    fallbackCommit: process.env.LKG_FALLBACK_COMMIT,
  });
  writeGithubOutput(process.env.GITHUB_OUTPUT, candidate);
  console.log(`Último despliegue verificado: run ${candidate.runId} · ${candidate.headSha}`);
}

if (require.main === module) {
  runFromEnvironment().catch(error => {
    console.error(`No se pudo resolver LKG: ${error.code || 'UNKNOWN'} · ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { cleanSha, fetchWithTimeout, findLastKnownGood, requestWorkflowRuns, writeGithubOutput };
