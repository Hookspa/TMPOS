const { test, expect } = require('@playwright/test');

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XHLkWQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ page }, testInfo) => {
  const theme = testInfo.project.name.includes('light') ? 'light' : 'dark';
  await page.clock.install({ time: new Date('2026-08-11T14:00:00-05:00') });
  await page.addInitScript(selectedTheme => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ao_theme', selectedTheme);
  }, theme);
  await page.route('**/storage/v1/object/public/ref-thumbs/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: TRANSPARENT_PNG,
  }));
});

async function stabilize(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      caret-color: transparent !important;
    }
  ` });
}

async function openLocalWorkspace(page) {
  await page.goto('/app.html');
  const authGate = page.locator('#auth-gate');
  await expect(authGate).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => showAuthGate(false));
  await expect(authGate).toBeHidden();
}

async function openWorkspace(page, name, isMobile) {
  if (isMobile) await page.evaluate(target => showPage(target), name);
  else await page.locator(`.nav-item[data-page="${name}"]`).click();
  await expect(page.locator(`#page-${name}`)).toHaveClass(/\bactive\b/);
  await stabilize(page);
}

test('Dashboard conserva su composición', async ({ page }) => {
  await openLocalWorkspace(page);
  await stabilize(page);
  await expect(page).toHaveScreenshot('dashboard.png', { animations: 'disabled', caret: 'hide' });
});

test('Tareas conserva su composición', async ({ page }, testInfo) => {
  await openLocalWorkspace(page);
  await openWorkspace(page, 'tareas', testInfo.project.name === 'mobile-dark');
  await expect(page).toHaveScreenshot('tareas.png', { animations: 'disabled', caret: 'hide' });
});

test('Banco conserva su composición', async ({ page }, testInfo) => {
  await openLocalWorkspace(page);
  await openWorkspace(page, 'banco', testInfo.project.name === 'mobile-dark');
  await expect(page).toHaveScreenshot('banco.png', { animations: 'disabled', caret: 'hide' });
});

test('Banco degradado conserva una señal operativa clara', async ({ page }, testInfo) => {
  await page.route('**/refs_02.csv', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'no disponible' }));
  await openLocalWorkspace(page);
  await expect.poll(() => page.evaluate(() => catalogLoaderState.status), { timeout: 15_000 }).toBe('degraded');
  await openWorkspace(page, 'banco', testInfo.project.name === 'mobile-dark');
  await expect(page.locator('#catalog-status [role="alert"]')).toBeVisible();
  await expect(page).toHaveScreenshot('banco-degraded.png', { animations: 'disabled', caret: 'hide' });
});

test('la ficha de lanzamiento conserva su composición', async ({ page }, testInfo) => {
  await openLocalWorkspace(page);
  await openWorkspace(page, 'lanzamientos', testInfo.project.name === 'mobile-dark');
  const firstLaunchOpen = page.locator('#launches-grid article.launch-card .card-open').first();
  await expect(firstLaunchOpen).toBeVisible();
  await firstLaunchOpen.click();
  await expect(page.locator('#page-launch')).toHaveClass(/\bactive\b/);
  await stabilize(page);
  await expect(page).toHaveScreenshot('ficha-lanzamiento.png', { animations: 'disabled', caret: 'hide' });
});
