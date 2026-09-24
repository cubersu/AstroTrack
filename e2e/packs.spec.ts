import { expect, test } from '@playwright/test';

test('downloads, verifies and removes an optional star pack', async ({ page }) => {
  await page.goto('/#/offline');
  const row = page.locator('.list-item', { hasText: 'Additional stars (HYG v4.1' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Not installed');
  await row.getByRole('button', { name: 'Download' }).click();
  await expect(row).toContainText('Installed', { timeout: 60_000 });
  await expect(page.getByText(/Installed Additional stars/)).toBeVisible();

  // The framing simulator now draws deeper stars from the installed tiles.
  await page.goto('/#/locations?new=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Test');
  await dialog.getByLabel(/Latitude/).fill('41');
  await dialog.getByLabel(/Longitude/).fill('29');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.list-item .title', { hasText: 'Test' })).toBeVisible();
  await page.goto('/#/equipment');
  await page.getByRole('button', { name: 'Load sample equipment' }).click();
  await page.goto('/#/target/ongc%3ANGC1952?date=2026-12-20');
  await expect(page.getByText(/stars-hyg-deep/).first()).toBeVisible({ timeout: 60_000 });

  await page.goto('/#/offline');
  await page
    .locator('.list-item', { hasText: 'Additional stars (HYG v4.1' })
    .getByRole('button', { name: 'Remove' })
    .click();
  await expect(page.locator('.list-item', { hasText: 'Additional stars (HYG v4.1' })).toContainText(
    'Not installed',
  );
});
