import { test, expect } from '@playwright/test';

test('tour loads start room and navigates through a link', async ({ page }) => {
  await page.goto('/?house=krakovska');
  await expect(page.locator('#header h1')).toHaveText('Novostavba RD Krakovská');
  const link = page.locator('.tour-link[data-to="chodba"]');
  await expect(link).toBeVisible({ timeout: 30_000 });
  await link.click();
  await expect(page).toHaveURL(/room=chodba/, { timeout: 30_000 });
  await expect(page.locator('.tour-link[data-to="loznice"]')).toHaveCount(1, { timeout: 30_000 });
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
