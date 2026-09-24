import { describe, expect, it } from 'vitest';
import {
  eclipseEvents,
  meteorShowerEvents,
  moonConjunctionEvents,
  moonPhaseEvents,
  oppositionEvents,
  planetsTonight,
  computeEvents,
} from './events';
import { ISTANBUL } from '../test/fixtures';
import { MS_PER_DAY } from './units';

const Y2026 = Date.UTC(2026, 0, 1);

describe('sky events (informational, not scored)', () => {
  it('finds moon quarters', () => {
    const ev = moonPhaseEvents(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 31));
    const full = ev.find((e) => e.data.phase === 'full')!;
    expect(new Date(full.timeMs).toISOString().slice(0, 10)).toBe('2026-10-26');
    expect(ev.length).toBeGreaterThanOrEqual(4);
  });
  it('finds the 2026 eclipses (total lunar 3 Mar, total solar 12 Aug)', () => {
    const ev = eclipseEvents(Y2026, Date.UTC(2026, 11, 31), ISTANBUL);
    const lunar = ev.filter((e) => e.kind === 'lunar-eclipse');
    const solar = ev.filter((e) => e.kind === 'solar-eclipse');
    expect(
      lunar.some(
        (e) =>
          new Date(e.timeMs).toISOString().startsWith('2026-03-03') &&
          e.data.eclipseKind === 'total',
      ),
    ).toBe(true);
    expect(
      solar.some(
        (e) =>
          new Date(e.timeMs).toISOString().startsWith('2026-08-12') &&
          e.data.eclipseKind === 'total',
      ),
    ).toBe(true);
  });
  it('computes meteor shower peaks from solar longitude', () => {
    const ev = meteorShowerEvents(Y2026, Date.UTC(2026, 11, 31), ISTANBUL);
    const per = ev.find((e) => e.data.code === 'PER')!;
    const d = new Date(per.timeMs);
    expect(d.getUTCMonth()).toBe(7); // August
    expect(d.getUTCDate()).toBeGreaterThanOrEqual(11);
    expect(d.getUTCDate()).toBeLessThanOrEqual(14);
    const gem = ev.find((e) => e.data.code === 'GEM')!;
    expect(new Date(gem.timeMs).getUTCMonth()).toBe(11);
    expect(gem.visibleHere).toBe(true);
  });
  it('finds oppositions within a year', () => {
    const ev = oppositionEvents(Y2026, Y2026 + 400 * MS_PER_DAY, ISTANBUL);
    expect(ev.map((e) => e.bodies[0])).toEqual(expect.arrayContaining(['Jupiter', 'Saturn']));
  });
  it('finds monthly moon–star conjunctions', () => {
    const ev = moonConjunctionEvents(Date.UTC(2026, 9, 1), Date.UTC(2026, 10, 1), ISTANBUL, 6);
    expect(ev.length).toBeGreaterThan(2);
    for (const e of ev) expect(e.data.separationDeg as number).toBeLessThanOrEqual(6);
  });
  it('lists planets for a night and returns events sorted by time', () => {
    const p = planetsTonight(Date.UTC(2026, 9, 10, 15), Date.UTC(2026, 9, 11, 4), ISTANBUL);
    expect(p).toHaveLength(7);
    const all = computeEvents(Date.UTC(2026, 9, 1), Date.UTC(2026, 9, 31), ISTANBUL);
    for (let i = 1; i < all.length; i++)
      expect(all[i].timeMs).toBeGreaterThanOrEqual(all[i - 1].timeMs);
    // Events never carry an Astro Score.
    for (const e of all) expect((e as unknown as Record<string, unknown>).score).toBeUndefined();
  });
});
