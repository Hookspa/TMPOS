const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  assertCatalogManifest,
  createCatalogArtifactFromCsv,
} = require('../../js/catalog-build.js');
const { CATALOG_MINIMUM_ROWS } = require('../../js/catalog.js');

const PUBLIC_FILES = Object.freeze(['app.html', 'index.html', 'ver.html', 'report.html', 'refs_02.csv']);
const PUBLIC_DIRECTORIES = Object.freeze(['css', 'js', 'logo_exports', 'screenshots']);
const CRITICAL_ASSETS = Object.freeze(['app.html', 'css/app.css', 'refs_02.csv']);

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readCatalogManifest(root) {
  const manifestPath = path.join(root, 'js', 'catalog-manifest.js');
  delete require.cache[require.resolve(manifestPath)];
  return require(manifestPath);
}

function walkFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isSymbolicLink()) {
      const error = new Error(`El artefacto público no admite enlaces simbólicos: ${relativePath}`);
      error.code = 'PUBLIC_SYMLINK_REJECTED';
      throw error;
    }
    if (entry.isDirectory()) return walkFiles(root, relativePath);
    return entry.isFile() ? [relativePath] : [];
  });
}

function publicPaths(root) {
  const paths = [
    ...PUBLIC_FILES,
    ...PUBLIC_DIRECTORIES.flatMap(directory => walkFiles(root, directory)),
  ].sort();
  paths.forEach(relativePath => {
    const absolutePath = path.join(root, relativePath);
    const entry = fs.lstatSync(absolutePath);
    if (entry.isSymbolicLink()) {
      const error = new Error(`El artefacto público no admite enlaces simbólicos: ${relativePath}`);
      error.code = 'PUBLIC_SYMLINK_REJECTED';
      throw error;
    }
    if (!entry.isFile()) {
      throw new Error(`Asset público inválido: ${relativePath}`);
    }
  });
  return paths;
}

function publicFileContent(root, relativePath, commit) {
  const content = fs.readFileSync(path.join(root, relativePath));
  if (relativePath === 'app.html') {
    const html = content.toString('utf8')
      .replace(/(<html\b[^>]*)(>)/i, `$1 data-deploy-commit="${commit}"$2`)
      .replace(/((?:src|href)=["'][^"']+\?v=)[^"']+/gi, `$1${commit}`);
    return Buffer.from(html, 'utf8');
  }
  if (relativePath === 'js/init.js') {
    return Buffer.from(
      content.toString('utf8').replace(/loadCatalogBank\('refs_02\.csv'\)/g, `loadCatalogBank('refs_02.csv?deploy=${commit}')`),
      'utf8',
    );
  }
  return content;
}

function createDeploymentManifest(options) {
  const root = path.resolve(options.root);
  const commit = String(options.commit || '').trim();
  if (!commit) throw new Error('El manifiesto de despliegue requiere un commit');

  const catalogText = fs.readFileSync(path.join(root, 'refs_02.csv'), 'utf8');
  const catalogManifest = readCatalogManifest(root);
  assertCatalogManifest(catalogText, catalogManifest, {
    minimumRows: options.minimumRows || CATALOG_MINIMUM_ROWS,
  });

  return {
    formatVersion: 1,
    commit,
    builtAt: options.builtAt || new Date().toISOString(),
    catalog: catalogManifest,
    files: publicPaths(root).map(relativePath => {
      const content = publicFileContent(root, relativePath, commit);
      return { path: relativePath, bytes: content.length, sha256: sha256(content) };
    }),
  };
}

function buildSite(options) {
  const root = path.resolve(options.root);
  const destination = path.resolve(options.destination);
  const defaultInternalDestination = path.join(root, '_site');
  const isInternalDestination = destination.startsWith(`${root}${path.sep}`);
  if (
    destination === root
    || root.startsWith(`${destination}${path.sep}`)
    || (isInternalDestination && destination !== defaultInternalDestination)
  ) {
    const error = new Error('El destino no puede reemplazar código fuente ni un ancestro del repositorio');
    error.code = 'UNSAFE_BUILD_DESTINATION';
    throw error;
  }

  const manifest = createDeploymentManifest(options);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  manifest.files.forEach(file => {
    const destinationPath = path.join(destination, file.path);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, publicFileContent(root, file.path, manifest.commit));
  });
  fs.writeFileSync(path.join(destination, '.nojekyll'), '', 'utf8');
  fs.writeFileSync(
    path.join(destination, 'deployment-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}

function comparableManifest(manifest) {
  return {
    formatVersion: manifest.formatVersion,
    commit: manifest.commit,
    catalog: manifest.catalog,
    files: manifest.files,
  };
}

function deploymentUrl(baseUrl, relativePath, commit) {
  const base = String(baseUrl).endsWith('/') ? String(baseUrl) : `${baseUrl}/`;
  const url = new URL(relativePath, base);
  url.searchParams.set('canary', commit);
  return url;
}

async function fetchAsset(fetchImpl, baseUrl, relativePath, commit, timeoutMs) {
  const controller = new AbortController();
  const deadlineMs = Math.max(1, Number(timeoutMs) || 15_000);
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${relativePath} excedió ${deadlineMs} ms`);
      error.code = 'DEPLOY_FETCH_TIMEOUT';
      error.asset = relativePath;
      reject(error);
      controller.abort();
    }, deadlineMs);
  });
  let response;
  try {
    response = await Promise.race([
      fetchImpl(deploymentUrl(baseUrl, relativePath, commit), {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' },
        signal: controller.signal,
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const error = new Error(`${relativePath} respondió HTTP ${response.status}`);
    error.code = 'DEPLOY_HTTP_ERROR';
    error.status = response.status;
    error.asset = relativePath;
    throw error;
  }
  return Buffer.from(await response.arrayBuffer());
}

async function verifyRemoteDeploymentOnce(options) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (!fetchImpl) throw new Error('El canary requiere fetch');
  const expected = createDeploymentManifest({
    root: options.expectedRoot,
    commit: options.expectedCommit,
    minimumRows: options.minimumRows,
    builtAt: 'ignored',
  });
  const manifestBuffer = await fetchAsset(
    fetchImpl,
    options.baseUrl,
    'deployment-manifest.json',
    options.expectedCommit,
    options.fetchTimeoutMs,
  );
  let deployed;
  try {
    deployed = JSON.parse(manifestBuffer.toString('utf8'));
  } catch (cause) {
    const error = new Error('deployment-manifest.json no contiene JSON válido');
    error.code = 'DEPLOY_MANIFEST_INVALID';
    throw error;
  }
  if (JSON.stringify(comparableManifest(deployed)) !== JSON.stringify(comparableManifest(expected))) {
    const error = new Error('El despliegue publicado no coincide con el commit esperado');
    error.code = 'DEPLOY_MANIFEST_MISMATCH';
    throw error;
  }

  const deployedFiles = new Map(deployed.files.map(file => [file.path, file]));
  const assets = {};
  await Promise.all(CRITICAL_ASSETS.map(async relativePath => {
    const content = await fetchAsset(
      fetchImpl,
      options.baseUrl,
      relativePath,
      options.expectedCommit,
      options.fetchTimeoutMs,
    );
    const expectedFile = deployedFiles.get(relativePath);
    if (!expectedFile || content.length !== expectedFile.bytes || sha256(content) !== expectedFile.sha256) {
      const error = new Error(`${relativePath} no coincide con su huella publicada`);
      error.code = 'DEPLOY_ASSET_MISMATCH';
      error.asset = relativePath;
      throw error;
    }
    assets[relativePath] = content;
  }));

  const html = assets['app.html'].toString('utf8');
  if (!/href=["']css\/app\.css\?/.test(html) || /id=["']bank-csv["']/.test(html)) {
    const error = new Error('app.html no cumple el contrato modular del shell');
    error.code = 'APP_SHELL_CONTRACT_MISMATCH';
    throw error;
  }
  const catalogText = assets['refs_02.csv'].toString('utf8');
  const catalog = createCatalogArtifactFromCsv(catalogText, {
    minimumRows: options.minimumRows || CATALOG_MINIMUM_ROWS,
  });
  assertCatalogManifest(catalogText, deployed.catalog, {
    minimumRows: options.minimumRows || CATALOG_MINIMUM_ROWS,
  });
  return {
    commit: deployed.commit,
    rowCount: catalog.stats.rowCount,
    catalogSha256: catalog.manifest.sha256,
  };
}

async function resolveCurrentProductionCommit(options) {
  const fallbackCommit = String(options.fallbackCommit || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(fallbackCommit)) {
    const error = new Error('El preflight requiere un commit de bootstrap completo');
    error.code = 'PREFLIGHT_FALLBACK_INVALID';
    throw error;
  }
  try {
    const manifestBuffer = await fetchAsset(
      options.fetch || globalThis.fetch,
      options.baseUrl,
      'deployment-manifest.json',
      'discover-current-production',
      options.fetchTimeoutMs,
    );
    const manifest = JSON.parse(manifestBuffer.toString('utf8'));
    const deployedCommit = String(manifest.commit || '').trim();
    if (!/^[0-9a-f]{40}$/i.test(deployedCommit)) throw new Error('Commit publicado inválido');
    return Object.freeze({ commit: deployedCommit, source: 'deployment-manifest' });
  } catch (_error) {
    return Object.freeze({ commit: fallbackCommit, source: 'legacy-bootstrap' });
  }
}

async function verifyLegacyRemoteDeploymentOnce(options) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (!fetchImpl) throw new Error('El preflight requiere fetch');
  const expectedRoot = path.resolve(options.expectedRoot);
  const assets = {};
  await Promise.all(CRITICAL_ASSETS.map(async relativePath => {
    const content = await fetchAsset(
      fetchImpl,
      options.baseUrl,
      relativePath,
      options.expectedCommit,
      options.fetchTimeoutMs,
    );
    const expected = fs.readFileSync(path.join(expectedRoot, relativePath));
    if (content.length !== expected.length || sha256(content) !== sha256(expected)) {
      const error = new Error(`${relativePath} no coincide con la versión activa anterior`);
      error.code = 'LEGACY_DEPLOY_ASSET_MISMATCH';
      error.asset = relativePath;
      throw error;
    }
    assets[relativePath] = content;
  }));
  const html = assets['app.html'].toString('utf8');
  if (!/href=["']css\/app\.css\?/.test(html) || /id=["']bank-csv["']/.test(html)) {
    const error = new Error('La versión activa anterior no cumple el contrato modular');
    error.code = 'APP_SHELL_CONTRACT_MISMATCH';
    throw error;
  }
  const catalogText = assets['refs_02.csv'].toString('utf8');
  const catalogManifest = readCatalogManifest(expectedRoot);
  const catalog = createCatalogArtifactFromCsv(catalogText, {
    minimumRows: options.minimumRows || CATALOG_MINIMUM_ROWS,
  });
  assertCatalogManifest(catalogText, catalogManifest, {
    minimumRows: options.minimumRows || CATALOG_MINIMUM_ROWS,
  });
  return {
    commit: options.expectedCommit,
    rowCount: catalog.stats.rowCount,
    catalogSha256: catalog.manifest.sha256,
    source: 'legacy-pages',
  };
}

async function verifyCurrentProduction(options) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyRemoteDeploymentOnce(options);
    } catch (manifestError) {
      try {
        return await verifyLegacyRemoteDeploymentOnce(options);
      } catch (legacyError) {
        legacyError.manifestErrorCode = manifestError.code || 'UNKNOWN';
        lastError = legacyError;
      }
    }
    if (attempt < attempts) await sleep(delayMs * attempt);
  }
  lastError.attempts = attempts;
  throw lastError;
}

async function verifyRemoteDeployment(options) {
  const attempts = Math.max(1, Number(options.attempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyRemoteDeploymentOnce(options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }
  lastError.attempts = attempts;
  throw lastError;
}

function createDeployIncident(details) {
  const cleanToken = (value, fallback, maximum) => String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maximum) || fallback;
  const cleanDate = value => String(value || new Date().toISOString()).replace(/[\r\n]+/g, '').slice(0, 40);
  return Object.freeze({
    formatVersion: 1,
    incidentId: cleanToken(details.incidentId, 'deploy-unknown', 100),
    occurredAt: cleanDate(details.occurredAt),
    commit: cleanToken(details.commit, 'unknown', 64),
    workflowRun: cleanToken(details.workflowRun, 'unknown', 100),
    cause: cleanToken(details.cause, 'CANARY_FAILED', 80),
    state: cleanToken(details.state, 'requires-intervention', 40),
    recoveryAttempted: details.recoveryAttempted === true,
    recoveryCommit: cleanToken(details.recoveryCommit, 'none', 64),
  });
}

module.exports = {
  buildSite,
  comparableManifest,
  createDeployIncident,
  createDeploymentManifest,
  CRITICAL_ASSETS,
  PUBLIC_DIRECTORIES,
  PUBLIC_FILES,
  publicFileContent,
  publicPaths,
  resolveCurrentProductionCommit,
  sha256,
  verifyCurrentProduction,
  verifyLegacyRemoteDeploymentOnce,
  verifyRemoteDeployment,
  verifyRemoteDeploymentOnce,
};
