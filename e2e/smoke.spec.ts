import { expect, test } from '@playwright/test';
import { addLocation, declineWeather, loadSampleEquipment } from './helpers';

test('core planning flow works end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await addLocation(page);
  await loadSampleEquipment(page);
  await page.goto('/#/tonight?date=2026-10-10');
  await declineWeather(page);
  // The whole catalogue is scanned in the worker and targets are ranked.
  await expect(page.getByText(/evaluated objects/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Andromeda Galaxy').first()).toBeVisible();

  // Target details: explainable score, framing and recipe.
  await page.goto('/#/target/ongc%3ANGC0224?date=2026-10-10');
  await expect(page.getByRole('heading', { name: 'Why this score' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Recommended focal length:')).toBeVisible();
  await expect(page.getByText('Total integration')).toBeVisible();
  await page.getByRole('button', { name: 'Add to favourites' }).click();
  await expect(page.getByRole('button', { name: 'Remove from favourites' })).toBeVisible();

  // Session mode and journal.
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByRole('heading', { name: 'Session' })).toBeVisible();
  await page.getByRole('button', { name: 'Add one frame' }).click();
  await page.getByRole('button', { name: 'Add one frame' }).click();
  await expect(page.getByText('2', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Save to journal' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.goto('/#/journal');
  await expect(page.getByText(/M 31/).first()).toBeVisible();

  // Language switch.
  await page.goto('/#/settings');
  await page.getByLabel('Language').selectOption('tr');
  await expect(page.getByRole('heading', { name: 'Ayarlar' })).toBeVisible();

  expect(errors).toEqual([]);
});
