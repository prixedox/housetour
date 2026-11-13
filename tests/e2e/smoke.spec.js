import { test, expect, devices } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { validateTour } from '../../src/tour-loader.js';

test('tour loads start room and navigates through a link', async ({ page }) => {
  await page.goto('/?house=krakovska');
  await expect(page.locator('#header h1')).toHaveText('Novostavba RD Krakovská');
  // The hallway doorway is about 90° to the left of the start view; turn towards it.
  await expect(page.locator('.psv-caption-content')).toHaveText('Obývací pokoj + kuchyně', { timeout: 30_000 });
  const link = page.locator('.tour-link[data-to="chodba"]');
  const viewport = page.viewportSize();
  for (let i = 0; i < 12; i++) {
    const box = await link.boundingBox();
    if (box && box.x > 0 && box.x + box.width < viewport.width) break;
    // Dragging to the right turns the view to the left.
    await page.mouse.move(viewport.width * 0.3, viewport.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(viewport.width * 0.6, viewport.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/room=chodba/, { timeout: 30_000 });
  // Entering from the living room keeps the walking direction (west), facing the kids' rooms.
  await expect(page.locator('.tour-link[data-to="pokoj105"]')).toHaveCount(1, { timeout: 30_000 });
});

test('deep link opens the requested room', async ({ page }) => {
  await page.goto('/?house=krakovska&room=koupelna');
  // Link arrows only exist in the DOM while inside the field of view, so assert on the caption instead.
  await expect(page.locator('.psv-caption-content')).toHaveText('Koupelna', { timeout: 30_000 });
  await expect(page).toHaveURL(/room=koupelna/);
});

test('unknown house shows czech error', async ({ page }) => {
  await page.goto('/?house=neexistuje');
  await expect(page.locator('.error-screen')).toHaveText('Prohlídka „neexistuje“ neexistuje.');
});

test('editor exports a valid tour.json', async ({ page }) => {
  page.on('dialog', (d) => d.dismiss());
  await page.goto('/?house=krakovska&edit');
  await expect(page.locator('.editor-panel')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[data-action="export"]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('tour.json');
  const json = JSON.parse(await readFile(await download.path(), 'utf8'));
  const { tour } = validateTour(json);
  expect(tour.rooms).toHaveLength(8);
});

test('360° tour links to the 3D model', async ({ page }) => {
  await page.goto('/?house=krakovska&room=chodba');
  await expect(page.locator('.psv-caption-content')).toHaveText('Chodba', { timeout: 30_000 });
  await page.locator('[title="3D model domu"]').click();
  await expect(page).toHaveURL(/view=3d/);
  await expect(page).toHaveURL(/room=chodba/);
  await expect(page.locator('.model3d canvas')).toBeVisible({ timeout: 30_000 });
});

test('3D model switches modes and opens a room as 360° photo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?house=krakovska&view=3d');
  await expect(page.locator('.model3d canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-mode="dollhouse"]')).toHaveClass(/is-active/);

  await page.locator('[data-mode="walk"]').click();
  await expect(page.locator('.model3d-hint')).toBeVisible();
  await expect(page.locator('.model3d-label').first()).toBeHidden();

  await page.locator('[data-mode="dollhouse"]').click();
  await page.locator('.model3d-label[data-room="koupelna"]').click();
  await expect(page).toHaveURL(/room=koupelna/);
  await expect(page).not.toHaveURL(/view=3d/);
  await expect(page.locator('.psv-caption-content')).toHaveText('Koupelna', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  const { defaultBrowserType, ...iPhone } = devices['iPhone 13'];
  test.use(iPhone);

  test('minimap is small and a tap opens the full plan', async ({ page }) => {
    await page.goto('/?house=krakovska&room=chodba');
    const map = page.locator('.psv-map');
    await expect(map).toBeVisible({ timeout: 30_000 });
    const box = await map.boundingBox();
    expect(box.width).toBeLessThanOrEqual(150);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('.psv-map--maximized')).toHaveCount(1);
    await expect(page).toHaveURL(/room=chodba/);
  });
});
