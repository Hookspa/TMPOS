const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }, testInfo) => {
  const theme = testInfo.project.name.includes('light') ? 'light' : 'dark';
  await page.addInitScript(selectedTheme => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ao_theme', selectedTheme);
  }, theme);
});

async function openLocalWorkspace(page) {
  await page.goto('/app.html');
  const authGate = page.locator('#auth-gate');
  await expect(authGate).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => showAuthGate(false));
  await expect(authGate).toBeHidden();
}

test('el usuario sin sesión ve el acceso al equipo', async ({ page }) => {
  await page.goto('/app.html');

  await expect(page.locator('#auth-gate')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#auth-title')).toHaveText('Entra a tu equipo');
  await expect(page.locator('#ag-email')).toBeFocused();
});

test('los favicons externos responden y conservan el color del navegador', async ({ page, request }) => {
  const assets = [
    '/logo_exports/tempo-mark-orange.svg',
    '/logo_exports/favicon-32.png',
    '/logo_exports/favicon-16.png',
    '/logo_exports/favicon.ico',
    '/logo_exports/favicon-180.png',
  ];
  const responses = await Promise.all(assets.map(asset => request.get(asset)));
  responses.forEach(response => expect(response.ok()).toBe(true));

  await page.goto('/app.html');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'logo_exports/favicon-180.png');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0a0a0a');
});

test('el Dashboard queda disponible mientras el catálogo sigue pendiente', async ({ page }) => {
  let releaseCatalog;
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  await page.route('**/refs_02.csv', async route => {
    await catalogGate;
    await route.abort();
  });

  await page.goto('/app.html');
  await expect(page.locator('#auth-gate')).toBeVisible({ timeout: 5_000 });
  await page.evaluate(() => showAuthGate(false));
  await expect(page.locator('#page-compas')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#page-compas h2')).toHaveText('Dashboard');
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status)).toBe('loading');

  releaseCatalog();
});

test('el usuario puede abrir ArtistOS y navegar al Banco', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const stylesheetResponse = page.waitForResponse(response => response.url().includes('/css/app.css'));

  await openLocalWorkspace(page);
  expect((await stylesheetResponse).ok()).toBe(true);

  await expect(page).toHaveTitle('Tempo OS');
  await expect(page.locator('#page-compas')).toHaveClass(/\bactive\b/);

  await page.locator('.nav-item[data-page="banco"]').click();

  await expect(page.locator('#page-banco')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#page-banco .ref-page-card').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('la navegación principal abre cada espacio de trabajo', async ({ page }, testInfo) => {
  await openLocalWorkspace(page);

  for (const pageName of ['lanzamientos', 'tareas', 'plananual', 'banco']) {
    await page.locator(`.nav-item[data-page="${pageName}"]`).click();
    await expect(page.locator(`#page-${pageName}`)).toHaveClass(/\bactive\b/);
  }
});

test('el diálogo de Ayuda cierra con Escape y restaura el foco', async ({ page }) => {
  await openLocalWorkspace(page);
  const helpButton = page.locator('#help-btn');
  const helpDialog = page.locator('#modal-ayuda');

  await helpButton.focus();
  await helpButton.click();
  await expect(helpDialog).toHaveJSProperty('open', true);

  await page.keyboard.press('Escape');

  await expect(helpDialog).toHaveJSProperty('open', false);
  await expect(helpButton).toBeFocused();
});

test('el cambio de tema queda persistido', async ({ page }, testInfo) => {
  await openLocalWorkspace(page);

  await page.locator('#theme-toggle').click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ao_theme'))).toBe('light');
});

test('el Banco conserva las referencias personales', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ao_custom_refs', JSON.stringify([{
      id: 'custom-regression-1',
      title: 'Referencia personal de regresión',
      hook: 'Gancho verificable',
      cat: ['custom'],
      for: ['single'],
      link: '',
      thumb: '',
      comentarios: '',
      icon: 'pin',
      custom: true,
      owned: true,
      shared: false,
    }]));
  });
  await openLocalWorkspace(page);
  await page.locator('.nav-item[data-page="banco"]').click();
  await page.locator('#banco-search').fill('Referencia personal de regresión');

  await expect(page.locator('#refs-grid')).toContainText('Referencia personal de regresión');
});

test('el catálogo unificado carga 6,066 referencias sin duplicar el legacy', async ({ page }) => {
  await openLocalWorkspace(page);

  await expect.poll(() => page.evaluate(() => window.TempoHealth.catalog().status), { timeout: 20_000 }).toBe('ready');
  const health = await page.evaluate(() => window.TempoHealth.catalog({ open: true }));
  expect(health).toEqual({ status: 'ready', references: 6066, bancoVisible: true });
});

test('el Banco trata el catálogo como datos y no como HTML ejecutable', async ({ page }) => {
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => window.TempoHealth.catalog().status), { timeout: 20_000 }).toBe('ready');
  await page.evaluate(() => {
    window.__catalogXss = 0;
    setReferencias([{
      id: 'hostile-reference',
      title: '<img src=x onerror="window.__catalogXss=1">',
      hook: '<svg onload="window.__catalogXss=2">',
      cat: ['</span><img src=x onerror="window.__catalogXss=3">'],
      for: ['<script>window.__catalogXss=4</script>'],
      link: 'https://example.com/x" onmouseover="window.__catalogXss=5',
      thumb: 'https://example.com/x" onload="window.__catalogXss=6',
      comentarios: '',
      icon: 'pin',
    }]);
    showPage('banco');
    renderBanco();
  });

  const card = page.locator('#refs-grid .ref-page-card').filter({ hasText: '<img src=x' });
  await expect(card).toBeVisible();
  await expect(card.locator('.ref-page-title img')).toHaveCount(0);
  expect(await card.locator('a').getAttribute('onmouseover')).toBeNull();
  expect(await card.locator('.ref-thumb-img').getAttribute('onload')).toBeNull();
  expect(await page.evaluate(() => window.__catalogXss)).toBe(0);
});

test('las selecciones antiguas conservan su vínculo y contador de uso', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ao_launches', JSON.stringify([{
      id: 'legacy-launch',
      name: 'Legacy',
      date: '2026-08-11',
      ideas: [{ key: 't:detrás de cámaras: mi trayectoria profesional', title: 'Detrás de Cámaras: Mi Trayectoria Profesional' }],
    }]));
    localStorage.setItem('ao_ref_usage', JSON.stringify({
      't:detrás de cámaras: mi trayectoria profesional': 2,
    }));
  });
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 20_000 }).toBe('ready');

  const migrated = await page.evaluate(() => ({
    key: launches[0].ideas[0].key,
    usage: JSON.parse(localStorage.getItem('ao_ref_usage')),
  }));
  expect(migrated.key).toBe('id:embedded-08061f310739b3e2266b');
  expect(migrated.usage['id:embedded-08061f310739b3e2266b']).toBe(2);
  expect(migrated.usage['t:detrás de cámaras: mi trayectoria profesional']).toBeUndefined();
});

test('si el catálogo falla, muestra 10 referencias de emergencia y permite recuperarse', async ({ page }) => {
  let catalogAvailable = false;
  await page.route('**/refs_02.csv', route => catalogAvailable
    ? route.continue()
    : route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporalmente no disponible' }));

  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await page.locator('.nav-item[data-page="banco"]').click();

  const alert = page.locator('#catalog-status [role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('10 referencias de emergencia');
  await expect.poll(() => page.evaluate(() => referencias.length)).toBe(10);

  catalogAvailable = true;
  await alert.getByRole('button', { name: 'Reintentar' }).click();

  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('ready');
  await expect(alert).toBeHidden();
  await expect.poll(() => page.evaluate(() => referencias.length)).toBe(6066);
});

test('el fallback conserva las referencias personales', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ao_custom_refs', JSON.stringify([{
      id: 'custom-offline-1', title: 'Referencia personal sin conexión', hook: '', cat: ['custom'], for: [],
      link: '', thumb: '', comentarios: '', icon: 'pin', custom: true, owned: true, shared: false,
    }]));
  });
  await page.route('**/refs_02.csv', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' }));

  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await page.locator('.nav-item[data-page="banco"]').click();

  await expect.poll(() => page.evaluate(() => referencias.length)).toBe(11);
  await expect(page.locator('#refs-grid')).toContainText('Referencia personal sin conexión');
});

test('Copiar diagnóstico conserva el reporte cuando no hay sesión', async ({ page }) => {
  await page.route('**/refs_02.csv', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' }));
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await page.locator('.nav-item[data-page="banco"]').click();

  await page.locator('#catalog-status').getByRole('button', { name: 'Copiar diagnóstico' }).click();

  await expect(page.locator('#ui-toast')).toContainText('Diagnóstico copiado');
});

test('Contactar soporte registra una sola incidencia por versión y workspace', async ({ page }) => {
  await page.route('**/refs_02.csv', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' }));
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await page.locator('.nav-item[data-page="banco"]').click();
  await page.evaluate(() => {
    window.__catalogAuditRows = [];
    _user = { id: 'user-1', email: 'operaciones@example.com' };
    _teamId = '11111111-1111-4111-8111-111111111111';
    getSb = async () => ({
      from: table => ({
        insert: async row => { window.__catalogAuditRows.push({ table, row }); return { error: null }; },
      }),
    });
    renderCatalogStatus();
  });

  const support = page.locator('#catalog-status').getByRole('button', { name: 'Enviar reporte técnico' });
  await support.click();
  await expect(page.locator('#ui-toast')).toContainText('Reporte enviado');
  await support.click();
  await expect(page.locator('#ui-toast')).toContainText('ya enviado');

  const reports = await page.evaluate(() => window.__catalogAuditRows);
  expect(reports).toHaveLength(1);
  expect(reports[0].table).toBe('audit_log');
  expect(reports[0].row.target_type).toBe('catalog_incident');
  const diagnostic = JSON.parse(reports[0].row.label);
  expect(diagnostic.workspaceId).toBe('11111111-1111-4111-8111-111111111111');
  expect(diagnostic.httpStatus).toBe(503);
  expect(diagnostic.attempt).toBe(3);
});

test('si audit_log falla, soporte conserva el diagnóstico mediante copia', async ({ page }) => {
  await page.route('**/refs_02.csv', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' }));
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await page.locator('.nav-item[data-page="banco"]').click();
  await page.evaluate(() => {
    _user = { id: 'user-2', email: 'equipo@example.com' };
    _teamId = '22222222-2222-4222-8222-222222222222';
    getSb = async () => ({ from: () => ({ insert: async () => ({ error: { message: 'tabla no disponible' } }) }) });
    renderCatalogStatus();
  });

  await page.locator('#catalog-status').getByRole('button', { name: 'Enviar reporte técnico' }).click();

  await expect(page.locator('#ui-toast')).toContainText('Diagnóstico copiado');
});

test('el branding de marca define --accent-fill con texto AA y se revierte a los tokens v7', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('ao_brand', JSON.stringify({ color: '#3366FF' })));
  await openLocalWorkspace(page);
  const readVar = name => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), name);
  await page.evaluate(() => applyBranding());
  expect(await readVar('--accent')).toBe('#3366FF');
  expect(await readVar('--accent-fill')).toBe('#3366FF');
  expect(await readVar('--accent-fg')).toBe('#FFF7ED');
  // Naranja vivo: el contraste WCAG elige tinta, nunca blanco (la luma vieja daba 2.9:1).
  await page.evaluate(() => { localStorage.setItem('ao_brand', JSON.stringify({ color: '#FF6900' })); applyBranding(); });
  expect(await readVar('--accent-fg')).toBe('#180A02');
  // Sin marca: vuelven los tokens del stylesheet (dual segun tema) y no queda --glow de color.
  await page.evaluate(() => { localStorage.removeItem('ao_brand'); applyBranding(); });
  const expectedFill = testInfo.project.name.includes('light') ? '#CA3500' : '#9F2D00';
  expect(await readVar('--accent-fill')).toBe(expectedFill);
  expect(await readVar('--glow')).not.toContain('255, 105');
});
