const path = require('node:path');

const { chromium } = require('@playwright/test');

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function run() {
  const baseUrl = argument('base-url', process.env.DEPLOY_BASE_URL);
  const expectedCommit = argument('expected-commit', process.env.GITHUB_SHA);
  const expectedRoot = path.resolve(argument('expected-root', path.resolve(__dirname, '../..')));
  const catalogManifestPath = path.join(expectedRoot, 'js', 'catalog-manifest.js');
  delete require.cache[require.resolve(catalogManifestPath)];
  const catalogManifest = require(catalogManifestPath);
  if (!baseUrl || !expectedCommit) throw new Error('browser-canary.js requiere --base-url y --expected-commit');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const url = new URL('app.html', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('canary', Date.now().toString());
    const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response || !response.ok()) throw new Error(`app.html respondió HTTP ${response && response.status()}`);
    await page.waitForFunction(
      () => window.TempoHealth && window.TempoHealth.catalog().status === 'ready',
      null,
      { timeout: 45_000 },
    );
    const result = await page.evaluate(() => ({
      ...window.TempoHealth.catalog({ open: true }),
      deployCommit: document.documentElement.dataset.deployCommit || '',
    }));
    if (
      result.status !== 'ready'
      || !result.bancoVisible
      || result.references < catalogManifest.rowCount
      || result.deployCommit !== expectedCommit
    ) {
      const error = new Error(`Banco incompleto: ${JSON.stringify(result)}`);
      error.code = 'BROWSER_CANARY_FAILED';
      throw error;
    }
    console.log(`Canary navegador listo: Banco ready con ${result.references} referencias`);
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(`Canary navegador falló: ${error.code || 'UNKNOWN'} · ${error.message}`);
  process.exitCode = 1;
});
