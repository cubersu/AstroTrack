import { DEFAULT_SCORING_SETTINGS, sanitizeSettings } from '../astro/config';
import type { AppSettings } from './types';
import { userDb } from './userDb';

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  language: null,
  theme: 'dark',
  activeLocationId: null,
  activeRigId: null,
  exposureMode: 'tracking',
  availability: 'night',
  customAvailabilityMin: 120,
  weatherEnabled: null,
  scoring: DEFAULT_SCORING_SETTINGS,
  dataSourceUrl: null,
  previewsEnabled: true,
  nightVisionSuggest: true,
  onboardingDone: false,
};

export function normalizeSettings(s: Partial<AppSettings> | undefined): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(s ?? {}), id: 'app' as const };
  merged.scoring = sanitizeSettings({ ...DEFAULT_SCORING_SETTINGS, ...(s?.scoring ?? {}) });
  return merged;
}

export async function getSettings(): Promise<AppSettings> {
  return normalizeSettings(await userDb().settings.get('app'));
}

export async function updateSettings(
  patch: Partial<Omit<AppSettings, 'id'>>,
): Promise<AppSettings> {
  const db = userDb();
  return db.transaction('rw', db.settings, async () => {
    const cur = normalizeSettings(await db.settings.get('app'));
    const next = normalizeSettings({ ...cur, ...patch });
    await db.settings.put(next);
    return next;
  });
}
