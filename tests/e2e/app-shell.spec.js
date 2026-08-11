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

  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 20_000 }).toBe('ready');
  await expect.poll(() => page.evaluate(() => referencias.length)).toBe(6066);
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

test('Contactar soporte copia el diagnóstico cuando no hay sesión', async ({ page }) => {
  await page.route('**/refs_02.csv', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' }));
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await page.locator('.nav-item[data-page="banco"]').click();

  await page.locator('#catalog-status').getByRole('button', { name: 'Contactar soporte' }).click();

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
  });

  const support = page.locator('#catalog-status').getByRole('button', { name: 'Contactar soporte' });
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
  });

  await page.locator('#catalog-status').getByRole('button', { name: 'Contactar soporte' }).click();

  await expect(page.locator('#ui-toast')).toContainText('Diagnóstico copiado');
});
