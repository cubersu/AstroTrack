import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CatalogService } from './catalogService';
import { AstroDataDb, setDataDbForTests } from '../data/dataDb';
import { setFetcherForTests } from '../data/packs';
import { DEFAULT_SCORING_SETTINGS } from '../astro/config';
import { resolveSiteSky } from '../astro/lightPollution';
import { ISTANBUL, SAMPLE_RIG } from '../test/fixtures';
import type { NightRequest } from './serviceTypes';

const PUBLIC = join(import.meta.dirname, '..', '..', 'public', 'data');
const BASE = 'https://app.test/data/';
const svc = new CatalogService();

const req: NightRequest = {
  location: ISTANBUL,
  date: { year: 2026, month: 10, day: 10 },
  rig: SAMPLE_RIG,
  sky: resolveSiteSky({ bortleManual: 5 }),
  settings: DEFAULT_SCORING_SETTINGS,
  exposureMode: 'tracking',
  timeMode: 'tonight',
  availableHours: null,
  weather: null,
  weatherEnabled: false,
};

beforeAll(async () => {
  setDataDbForTests(new AstroDataDb(`svc-${Math.random()}`));
  setFetcherForTests(async (url) => {
    const rel = url.replace(BASE, '').split('?')[0];
    const p = join(PUBLIC, rel);
    return existsSync(p) ? new Response(readFileSync(p)) : new Response('nf', { status: 404 });
  });
  await svc.init(BASE);
});

describe('CatalogService (acceptance scenario)', () => {
  it('reports the bundled catalogue', () => {
    const info = svc.info();
    expect(info.count).toBeGreaterThan(13000);
    expect(info.source).toBe('bundled');
  });
  it('scans the whole catalogue and ranks visible candidates', () => {
    const r = svc.scan({ ...req, limit: 50 });
    expect(r.evaluated).toBeGreaterThan(5000);
    expect(r.items.length).toBe(50);
    const names = r.items.map((i) => i.summary.name);
    expect(names).toContain('M 31');
    expect(names).toContain('M 45');
    // Everything returned is visible tonight and not excluded.
    for (const it of r.items) {
      expect(it.astroScore).toBeGreaterThan(0);
      expect(it.hardConstraints).not.toContain('too-small');
    }
    // Sorted by Tonight Score.
    for (let i = 1; i < r.items.length; i++)
      expect(r.items[i - 1].tonight.score).toBeGreaterThanOrEqual(r.items[i].tonight.score);
  });
  it('eliminates obviously unsuitable small targets', () => {
    const r = svc.scan({ ...req, limit: 20000, includeUnsuitable: true });
    const m57 = r.items.find((i) => i.summary.name === 'M 57');
    expect(m57?.hardConstraints).toContain('too-small');
    const top = r.items.slice(0, 100);
    expect(top.every((i) => !i.hardConstraints.includes('too-small'))).toBe(true);
  });
  it('evaluates a single target with curves and a recipe', () => {
    const ev = svc.evaluate({ ...req, id: 'ongc:NGC0224' })!;
    expect(ev.summary.name).toBe('M 31');
    expect(ev.curves.targetAlt.length).toBe(ev.curves.times.length);
    expect(ev.evaluation.optics?.focalLengthMm).toBeGreaterThan(100);
    expect(ev.evaluation.sub?.recommendedS).toBeGreaterThan(0);
    expect(ev.evaluation.integration?.recommendedH).toBeGreaterThan(0);
    expect(ev.tonight.weatherStatus).toBe('disabled');
  });
  it('loads object details lazily', async () => {
    const d = await svc.detail('ongc:NGC0224');
    expect(d?.detail?.catalogue).toBe('OpenNGC');
    expect(d?.detail?.aliases).toContain('NGC 224');
  });
  it('returns a star field around a target', async () => {
    const f = await svc.starField({ raDeg: 56.85, decDeg: 24.12, radiusDeg: 3, magLimit: 8 });
    expect(f.ra.length).toBeGreaterThan(20);
    expect(f.labels.some((l) => l.label === 'Alcyone')).toBe(true);
  });
  it('scans favourites over upcoming nights', () => {
    const r = svc.opportunities({
      ...req,
      ids: ['ongc:NGC0224', 'ongc:NGC1976'],
      startDate: req.date,
      days: 7,
    });
    expect(r.targets).toHaveLength(2);
    expect(r.targets[0].nights).toHaveLength(7);
    expect(r.targets[0].best).not.toBeNull();
  });
});
