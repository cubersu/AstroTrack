import { expect, test } from '@playwright/test';
import { addLocation, declineWeather, loadSampleEquipment } from './helpers';

test('installs, caches and keeps working offline', async ({ page, context }) => {
  // 1. Load the application.
  await page.goto('/');
  // 2. Wait until the service worker is installed and has precached the app + core data.
  // With registerType "prompt" the first worker activates without claiming the
  // page, so readiness is awaited and the page reloaded to come under its control.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.active?.state;
  });
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          for (const k of keys) {
            const c = await caches.open(k);
            const reqs = await c.keys();
            if (reqs.some((r) => r.url.includes('data/core/dso/index.bin'))) return true;
          }
          return false;
        }),
      { timeout: 60_000 },
    )
    .toBe(true);

  await addLocation(page);
  await loadSampleEquipment(page);

  // 3. Disable the network. 4. Reload.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline').first()).toBeVisible();

  // 5. Core catalogue search still works.
  await page.goto('/#/explore');
  await page.getByLabel('Search').fill('M31');
  await expect(page.getByText('Andromeda Galaxy').first()).toBeVisible({ timeout: 30_000 });

  // Planning still works (weather gracefully unavailable).
  await page.goto('/#/tonight?date=2026-10-10');
  await declineWeather(page);
  await expect(page.getByText(/evaluated objects/)).toBeVisible({ timeout: 60_000 });
  await page.goto('/#/target/ongc%3ANGC1976?date=2026-12-20');
  await expect(page.getByRole('heading', { name: 'Why this score' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('No survey image cached').first()).toBeVisible();

  await context.setOffline(false);
});
