import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Add a location through the UI (manual coordinates, manual Bortle). */
export async function addLocation(
  page: Page,
  name = 'Istanbul',
  lat = '41.06',
  lon = '29.06',
  bortle = '6',
) {
  await page.goto('/#/locations?new=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByLabel(/Latitude/).fill(lat);
  await dialog.getByLabel(/Longitude/).fill(lon);
  await dialog.getByLabel(/Bortle class/).selectOption(bortle);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.list-item .title', { hasText: name }).first()).toBeVisible();
}

export async function loadSampleEquipment(page: Page) {
  await page.goto('/#/equipment');
  await page.getByRole('button', { name: 'Load sample equipment' }).click();
  await expect(
    page.locator('.list-item .title', { hasText: 'APS-C + lenses (sample)' }).first(),
  ).toBeVisible();
}

export async function declineWeather(page: Page) {
  const btn = page.getByRole('button', { name: 'Not now' });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}
