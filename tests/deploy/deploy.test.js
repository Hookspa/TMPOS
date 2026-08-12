const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildSite,
  createDeployIncident,
  createDeploymentManifest,
  publicFileContent,
  publicPaths,
  sha256,
  verifyCurrentProduction,
  verifyRemoteDeployment,
} = require('../../.github/scripts/deploy-contract.js');

const root = path.resolve(__dirname, '../..');

function artifactFetch(destination, mutate) {
  return async input => {
    const url = new URL(input);
    const relativePath = url.pathname.replace(/^\/TMPOS\//, '');
    let content = fs.readFileSync(path.join(destination, relativePath));
    if (mutate) content = mutate(relativePath, content);
    return new Response(content, { status: 200 });
  };
}

test('el artefacto de Pages contiene solo runtime público y un manifiesto verificable', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'artistos-pages-'));
  const destination = path.join(temporary, 'site');
  try {
    const manifest = buildSite({
      root,
      destination,
      commit: 'abcdef1234567890',
      builtAt: '2026-08-11T18:00:00.000Z',
    });

    assert.equal(manifest.commit, 'abcdef1234567890');
    assert.equal(manifest.catalog.rowCount, 6066);
    assert.ok(manifest.files.some(file => file.path === 'css/app.css'));
    assert.ok(manifest.files.some(file => file.path === 'refs_02.csv'));
    assert.ok(fs.existsSync(path.join(destination, '.nojekyll')));
    assert.ok(!fs.existsSync(path.join(destination, 'package.json')));
    assert.ok(!fs.existsSync(path.join(destination, 'tests')));
    const deployedManifest = JSON.parse(fs.readFileSync(path.join(destination, 'deployment-manifest.json'), 'utf8'));
    assert.deepEqual(deployedManifest, manifest);
    const deployedHtml = fs.readFileSync(path.join(destination, 'app.html'), 'utf8');
    const deployedInit = fs.readFileSync(path.join(destination, 'js/init.js'), 'utf8');
    assert.match(deployedHtml, /data-deploy-commit="abcdef1234567890"/);
    assert.match(deployedHtml, /css\/app\.css\?v=abcdef1234567890/);
    assert.match(deployedHtml, /js\/app\.js\?v=abcdef1234567890/);
    assert.match(deployedInit, /refs_02\.csv\?deploy=abcdef1234567890/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('el canary acepta un despliegue atómico que coincide con el commit esperado', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'artistos-canary-'));
  const destination = path.join(temporary, 'site');
  try {
    buildSite({ root, destination, commit: 'good-commit' });
    const result = await verifyRemoteDeployment({
      baseUrl: 'https://example.test/TMPOS/',
      expectedCommit: 'good-commit',
      expectedRoot: root,
      attempts: 1,
      fetch: artifactFetch(destination),
    });

    assert.equal(result.commit, 'good-commit');
    assert.equal(result.rowCount, 6066);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('el preflight reconoce la publicación legacy exacta antes de activar Actions', async () => {
  const result = await verifyCurrentProduction({
    baseUrl: 'https://example.test/TMPOS/',
    expectedCommit: 'legacy-commit',
    expectedRoot: root,
    attempts: 1,
    fetch: artifactFetch(root),
  });
  assert.equal(result.commit, 'legacy-commit');
  assert.equal(result.source, 'legacy-pages');
  assert.equal(result.rowCount, 6066);
});

test('el canary rechaza un asset alterado aunque responda HTTP 200', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'artistos-corrupt-'));
  const destination = path.join(temporary, 'site');
  try {
    buildSite({ root, destination, commit: 'bad-commit' });
    await assert.rejects(
      verifyRemoteDeployment({
        baseUrl: 'https://example.test/TMPOS/',
        expectedCommit: 'bad-commit',
        expectedRoot: root,
        attempts: 1,
        fetch: artifactFetch(destination, (relativePath, content) => (
          relativePath === 'css/app.css' ? Buffer.concat([content, Buffer.from('\ncorrupto')]) : content
        )),
      }),
      error => error.code === 'DEPLOY_ASSET_MISMATCH' && error.asset === 'css/app.css',
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('el canary corta un fetch colgado con un código estable', async () => {
  await assert.rejects(
    verifyRemoteDeployment({
      baseUrl: 'https://example.test/TMPOS/',
      expectedCommit: 'timeout-commit',
      expectedRoot: root,
      attempts: 1,
      fetchTimeoutMs: 10,
      fetch: (_input, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    }),
    error => error.code === 'DEPLOY_FETCH_TIMEOUT' && error.asset === 'deployment-manifest.json',
  );
});

test('el canary reintenta con backoff y conserva el último fallo', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'artistos-retry-'));
  const destination = path.join(temporary, 'site');
  const delays = [];
  try {
    buildSite({ root, destination, commit: 'retry-commit' });
    let requestCount = 0;
    const stableFetch = artifactFetch(destination);
    const result = await verifyRemoteDeployment({
      baseUrl: 'https://example.test/TMPOS/',
      expectedCommit: 'retry-commit',
      expectedRoot: root,
      attempts: 3,
      delayMs: 25,
      sleep: async milliseconds => { delays.push(milliseconds); },
      fetch: async (...args) => {
        requestCount += 1;
        if (requestCount === 1) return new Response('temporal', { status: 503 });
        return stableFetch(...args);
      },
    });

    assert.equal(result.commit, 'retry-commit');
    assert.deepEqual(delays, [25]);

    const exhaustedDelays = [];
    await assert.rejects(verifyRemoteDeployment({
      baseUrl: 'https://example.test/TMPOS/',
      expectedCommit: 'retry-commit',
      expectedRoot: root,
      attempts: 3,
      delayMs: 10,
      sleep: async milliseconds => { exhaustedDelays.push(milliseconds); },
      fetch: async () => new Response('caído', { status: 503 }),
    }), error => error.code === 'DEPLOY_HTTP_ERROR' && error.attempts === 3);
    assert.deepEqual(exhaustedDelays, [10, 20]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('el constructor rechaza destinos destructivos y enlaces simbólicos públicos', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'artistos-safety-'));
  try {
    const sentinel = path.join(temporary, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'preservar', 'utf8');
    assert.throws(
      () => buildSite({ root: temporary, destination: temporary, commit: 'unsafe' }),
      error => error.code === 'UNSAFE_BUILD_DESTINATION',
    );
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'preservar');
    const sourceDirectory = path.join(temporary, 'js');
    fs.mkdirSync(sourceDirectory, { recursive: true });
    const sourceSentinel = path.join(sourceDirectory, 'source.js');
    fs.writeFileSync(sourceSentinel, 'preservar fuente', 'utf8');
    assert.throws(
      () => buildSite({ root: temporary, destination: sourceDirectory, commit: 'unsafe-subdir' }),
      error => error.code === 'UNSAFE_BUILD_DESTINATION',
    );
    assert.equal(fs.readFileSync(sourceSentinel, 'utf8'), 'preservar fuente');

    ['css', 'js', 'logo_exports', 'screenshots'].forEach(directory => (
      fs.mkdirSync(path.join(temporary, directory), { recursive: true })
    ));
    ['app.html', 'index.html', 'ver.html', 'report.html', 'refs_02.csv'].forEach(file => (
      fs.writeFileSync(path.join(temporary, file), '', 'utf8')
    ));
    fs.symlinkSync(sentinel, path.join(temporary, 'js', 'linked.js'));
    assert.throws(() => publicPaths(temporary), error => error.code === 'PUBLIC_SYMLINK_REJECTED');
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('el workflow bloquea publicación fuera de main y usa dependencias inmutables', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.doesNotMatch(workflow, /uses:\s*[^\n]+@v\d/);
  assert.match(workflow, /npm run test:ci/);
  assert.match(workflow, /find-last-known-good\.js/);
  assert.match(workflow, /vars\.DEPLOY_ENABLED == 'true'/);
  assert.match(workflow, /preflight-production:/);
  assert.match(workflow, /LKG_FALLBACK_COMMIT/);
  assert.match(workflow, /group: artistos-\$\{\{/);
  assert.match(workflow, /needs: \[deploy, canary, recover\]/);
});

test('los manifiestos fuente conservan huellas determinísticas y no dependen de builtAt', () => {
  const first = createDeploymentManifest({ root, commit: 'same', builtAt: 'uno' });
  const second = createDeploymentManifest({ root, commit: 'same', builtAt: 'dos' });

  assert.notEqual(first.builtAt, second.builtAt);
  assert.deepEqual(first.files, second.files);
  assert.equal(first.files.find(file => file.path === 'app.html').sha256, sha256(publicFileContent(root, 'app.html', 'same')));
});

test('el registro técnico elimina saltos y no captura mensajes crudos', () => {
  const incident = createDeployIncident({
    incidentId: 'deploy-1\nAuthorization: secreto',
    commit: 'abc123',
    cause: 'DEPLOY_ASSET_MISMATCH\ntoken privado',
    state: 'recovered-automatically',
    recoveryAttempted: true,
    recoveryCommit: 'previous123',
  });

  assert.equal(incident.recoveryAttempted, true);
  assert.equal(incident.state, 'recovered-automatically');
  assert.doesNotMatch(JSON.stringify(incident), /\n/);
  assert.doesNotMatch(JSON.stringify(incident), /Authorization:/);
});
