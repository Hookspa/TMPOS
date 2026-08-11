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

  await openLocalWorkspace(page);

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
