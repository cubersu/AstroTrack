import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { buildNightGrid } from './nightGrid';
import { computeNight, darkHours } from './twilight';
import {
  alwaysAbove,
  culminationAltitudeDeg,
  neverRisesAbove,
  riseTransitSet,
  summarizeVisibility,
} from './visibility';
import { observerOf, j2000ToOfDate, precessionMatrix } from './ephemeris';
import { ISTANBUL, OSLO, SIDING_SPRING } from '../test/fixtures';
import { MS_PER_HOUR, MS_PER_MINUTE } from './units';

describe('twilight / night boundaries', () => {
  it('orders dusk and dawn correctly (Istanbul, October)', () => {
    const n = computeNight({ year: 2026, month: 10, day: 15 }, ISTANBUL);
    expect(n.darkness).toBe('astronomical');
    const seq = [
      n.sunsetMs,
      n.civilDuskMs,
      n.nauticalDuskMs,
      n.astroDuskMs,
      n.astroDawnMs,
      n.nauticalDawnMs,
      n.civilDawnMs,
      n.sunriseMs,
    ];
    for (const v of seq) expect(v).not.toBeNull();
    for (let i = 1; i < seq.length; i++) expect(seq[i]!).toBeGreaterThan(seq[i - 1]!);
    // Sunset in Istanbul mid-October ≈ 15:25 UTC (18:25 local).
    const ss = new Date(n.sunsetMs!);
    expect(ss.getUTCHours()).toBe(15);
    expect(darkHours(n)).toBeGreaterThan(9);
    expect(darkHours(n)).toBeLessThan(10.5);
  });
  it('agrees with Astronomy Engine altitude search', () => {
    const n = computeNight({ year: 2026, month: 10, day: 15 }, ISTANBUL);
    const t = A.SearchAltitude(A.Body.Sun, observerOf(ISTANBUL), -1, new Date(n.anchorMs), 1, -18);
    expect(n.astroDuskMs).toBe(t!.date.getTime());
    const sunAlt = A.Horizon(
      new Date(n.astroDuskMs!),
      observerOf(ISTANBUL),
      A.Equator(A.Body.Sun, new Date(n.astroDuskMs!), observerOf(ISTANBUL), true, true).ra,
      A.Equator(A.Body.Sun, new Date(n.astroDuskMs!), observerOf(ISTANBUL), true, true).dec,
    ).altitude;
    expect(sunAlt).toBeCloseTo(-18, 1);
  });
  it('detects missing astronomical night near the June solstice at 60°N', () => {
    const n = computeNight({ year: 2026, month: 6, day: 21 }, OSLO);
    expect(n.darkness).toBe('civil');
    expect(n.astroDuskMs).toBeNull();
    expect(darkHours(n)).toBe(0);
  });
  it('works in the southern hemisphere', () => {
    const n = computeNight({ year: 2026, month: 6, day: 21 }, SIDING_SPRING);
    expect(n.darkness).toBe('astronomical');
    expect(darkHours(n)).toBeGreaterThan(10);
  });
});

describe('rise / transit / set', () => {
  const targets = [
    { name: 'M31', ra: 10.6847, dec: 41.2687 },
    { name: 'M42', ra: 83.8221, dec: -5.3911 },
    { name: 'M13', ra: 250.4235, dec: 36.4613 },
  ];
  for (const tg of targets) {
    it(`matches Astronomy Engine for ${tg.name}`, () => {
      const t0 = Date.UTC(2026, 9, 15, 18, 0);
      A.DefineStar(A.Body.Star1, tg.ra / 15, tg.dec, 1000);
      const obs = observerOf(ISTANBUL);
      const pod = j2000ToOfDate({ raDeg: tg.ra, decDeg: tg.dec }, precessionMatrix(t0));
      const rts = riseTransitSet(pod, ISTANBUL, t0);
      const refTransit = A.SearchHourAngle(
        A.Body.Star1,
        obs,
        0,
        new Date(rts.transitMs - 6 * MS_PER_HOUR),
        +1,
      );
      expect(Math.abs(refTransit.time.date.getTime() - rts.transitMs)).toBeLessThan(MS_PER_MINUTE);
      const refRise = A.SearchRiseSet(
        A.Body.Star1,
        obs,
        +1,
        new Date(rts.transitMs - 14 * MS_PER_HOUR),
        1,
      );
      const refSet = A.SearchRiseSet(A.Body.Star1, obs, -1, new Date(rts.transitMs), 1);
      if (rts.riseMs !== null) {
        expect(Math.abs(refRise!.date.getTime() - rts.riseMs)).toBeLessThan(2 * MS_PER_MINUTE);
        expect(Math.abs(refSet!.date.getTime() - rts.setMs!)).toBeLessThan(2 * MS_PER_MINUTE);
      }
    });
  }
  it('handles circumpolar and never-rising objects', () => {
    const t0 = Date.UTC(2026, 0, 1);
    const polaris = riseTransitSet({ raDeg: 37.95, decDeg: 89.26 }, ISTANBUL, t0);
    expect(polaris.circumpolar).toBe(true);
    const southPoleStar = riseTransitSet({ raDeg: 317, decDeg: -88.9 }, ISTANBUL, t0);
    expect(southPoleStar.neverRises).toBe(true);
    expect(neverRisesAbove(-60, 41, 0)).toBe(true);
    expect(neverRisesAbove(-40, 41, 10)).toBe(true); // culminates at 9°
    expect(neverRisesAbove(-35, 41, 10)).toBe(false);
    expect(alwaysAbove(60, 41, 0)).toBe(true);
    expect(alwaysAbove(40, 41, 0)).toBe(false);
    expect(culminationAltitudeDeg(41.27, 41.06)).toBeCloseTo(89.79, 2);
  });
});

describe('night grid and visibility summary', () => {
  it('produces an altitude curve consistent with Astronomy Engine', () => {
    const night = computeNight({ year: 2026, month: 10, day: 15 }, ISTANBUL);
    const grid = buildNightGrid(ISTANBUL, night, 10);
    const s = summarizeVisibility(grid, { raDeg: 10.6847, decDeg: 41.2687 }, 30);
    // M31 transits near local midnight in mid-October, very high from Istanbul.
    expect(s.curve.maxAltDeg).toBeGreaterThan(85);
    expect(s.darkHoursAboveMin).toBeGreaterThan(7);
    const i = Math.floor(grid.times.length / 2);
    A.DefineStar(A.Body.Star2, 10.6847 / 15, 41.2687, 1000);
    const eq = A.Equator(A.Body.Star2, new Date(grid.times[i]), observerOf(ISTANBUL), true, false);
    const hor = A.Horizon(new Date(grid.times[i]), observerOf(ISTANBUL), eq.ra, eq.dec);
    expect(s.curve.alt[i]).toBeCloseTo(hor.altitude, 1);
  });
  it('reports zero usable time for a target below the minimum altitude', () => {
    const night = computeNight({ year: 2026, month: 10, day: 15 }, ISTANBUL);
    const grid = buildNightGrid(ISTANBUL, night, 10);
    // Omega Centauri never gets above ~6° from 41°N.
    const s = summarizeVisibility(grid, { raDeg: 201.697, decDeg: -47.4795 }, 20);
    expect(s.darkHoursAboveMin).toBe(0);
    expect(s.darkWindows).toHaveLength(0);
  });
  it('dark flags only cover astronomical darkness', () => {
    const night = computeNight({ year: 2026, month: 10, day: 15 }, ISTANBUL);
    const grid = buildNightGrid(ISTANBUL, night, 10);
    for (let i = 0; i < grid.times.length; i++) {
      if (grid.dark[i]) expect(grid.sunAlt[i]).toBeLessThan(-17.5);
    }
  });
});
