import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_SETTINGS, classifyScore } from './config';
import type { ScoringSettings } from './config';
import { resolveSiteSky } from './lightPollution';
import { buildNightGrid } from './nightGrid';
import type { EvaluationContext, RigInput, TargetInput } from './scoring';
import { evaluateDso } from './scoring';
import { computeNight } from './twilight';
import { tonightScore, timeMultiplier, weatherMultiplier } from './tonight';
import { scoreHour } from './weatherScore';
import type { HourlyWeather } from './weatherScore';
import { ISTANBUL, SAMPLE_RIG, TARGETS } from '../test/fixtures';
import type { CalendarDate } from './time';
import { MS_PER_HOUR } from './units';

const NEW_MOON_NIGHT: CalendarDate = { year: 2026, month: 10, day: 10 };
const FULL_MOON_NIGHT: CalendarDate = { year: 2026, month: 10, day: 25 };

const gridCache = new Map<string, ReturnType<typeof buildNightGrid>>();
function grid(date: CalendarDate) {
  const key = `${date.year}-${date.month}-${date.day}`;
  if (!gridCache.has(key))
    gridCache.set(key, buildNightGrid(ISTANBUL, computeNight(date, ISTANBUL), 10));
  return gridCache.get(key)!;
}

function ctx(
  date: CalendarDate,
  bortle: number,
  over: Partial<EvaluationContext> = {},
  settings: Partial<ScoringSettings> = {},
): EvaluationContext {
  return {
    grid: grid(date),
    sky: resolveSiteSky({ bortleManual: bortle }),
    settings: { ...DEFAULT_SCORING_SETTINGS, ...settings },
    exposureMode: 'tracking',
    timeMode: 'tonight',
    availableHours: null,
    ...over,
  };
}

function evalT(target: TargetInput, c: EvaluationContext, rig: RigInput = SAMPLE_RIG) {
  return evaluateDso(target, rig, c);
}

describe('Astro Score — acceptance scenario (sample rig, Istanbul, October)', () => {
  const ev = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 5));
  it('identifies M31 as a visible, well-scored candidate', () => {
    expect(ev.hardConstraints).toEqual([]);
    expect(ev.score).toBeGreaterThanOrEqual(60);
    expect(ev.visibility!.curve.maxAltDeg).toBeGreaterThan(80);
  });
  it('recommends a focal length within the rig and computes the FOV', () => {
    expect(ev.optics).not.toBeNull();
    const fl = ev.optics!.focalLengthMm;
    expect(fl).toBeGreaterThanOrEqual(18);
    expect(fl).toBeLessThanOrEqual(200);
    // M31 (~3° long) at a balanced fill of 40–70% of the long side → ~180–200 mm on APS-C
    expect(fl).toBeGreaterThan(150);
    expect(ev.optics!.opticsId).toBe('z18200');
    expect(ev.optics!.framing.fill).toBeGreaterThan(0.4);
    expect(ev.optics!.framing.fill).toBeLessThan(0.7);
    expect(ev.optics!.framing.fovWidthDeg).toBeGreaterThan(3);
  });
  it('produces an explainable result with components summing to the score', () => {
    const sum = Object.values(ev.components).reduce((s, c) => s + c.score * c.weight, 0);
    expect(Math.round(sum)).toBe(ev.score);
    expect(ev.reasons.some((r) => r.polarity === 'positive')).toBe(true);
    expect(ev.confidence.level).toMatch(/high|medium|low/);
  });
  it('produces an exposure recipe and integration guidance', () => {
    expect(ev.sub!.recommendedS).toBeGreaterThan(0);
    expect(ev.integration!.minimumH).toBeLessThan(ev.integration!.recommendedH);
    expect(ev.integration!.recommendedH).toBeLessThan(ev.integration!.idealH);
    expect(ev.window).not.toBeNull();
  });
  it('flags uncalibrated tracking in the confidence factors', () => {
    expect(ev.confidence.factors).toContain('trackingUncalibrated');
  });
});

describe('Moon impact is object-type aware', () => {
  it('a bright Moon hurts a low-surface-brightness galaxy more than an open cluster', () => {
    const galNew = evalT(TARGETS.M33, ctx(NEW_MOON_NIGHT, 4));
    const galFull = evalT(TARGETS.M33, ctx(FULL_MOON_NIGHT, 4));
    const ocNew = evalT(TARGETS.NGC752, ctx(NEW_MOON_NIGHT, 4));
    const ocFull = evalT(TARGETS.NGC752, ctx(FULL_MOON_NIGHT, 4));
    expect(galNew.components.moon.score).toBeGreaterThan(95);
    expect(ocNew.components.moon.score).toBeGreaterThan(95);
    expect(galFull.components.moon.score).toBeLessThan(ocFull.components.moon.score);
    const galDrop = galNew.components.moon.score - galFull.components.moon.score;
    const ocDrop = ocNew.components.moon.score - ocFull.components.moon.score;
    expect(galDrop).toBeGreaterThan(ocDrop * 1.5);
    expect(
      galFull.reasons.some((r) => r.code === 'moon.bright' || r.code === 'moon.moderate'),
    ).toBe(true);
  });
  it('moon tolerance preference changes the penalty but not the physics', () => {
    const strict = evalT(TARGETS.M33, ctx(FULL_MOON_NIGHT, 4, {}, { moonTolerance: 'strict' }));
    const relaxed = evalT(TARGETS.M33, ctx(FULL_MOON_NIGHT, 4, {}, { moonTolerance: 'relaxed' }));
    expect(strict.components.moon.score).toBeLessThan(relaxed.components.moon.score);
    expect(strict.moon!.meanDeltaMag).toBeCloseTo(relaxed.moon!.meanDeltaMag, 5);
  });
});

describe('Light pollution is object-type aware', () => {
  it('Bortle 8 penalises a reflection nebula far more than an open cluster', () => {
    const rnDark = evalT(TARGETS.NGC7023, ctx(NEW_MOON_NIGHT, 2));
    const rnCity = evalT(TARGETS.NGC7023, ctx(NEW_MOON_NIGHT, 8));
    const ocCity = evalT(TARGETS.NGC752, ctx(NEW_MOON_NIGHT, 8));
    expect(rnDark.components.lightPollution.score).toBeGreaterThan(80);
    expect(rnCity.components.lightPollution.score).toBeLessThan(35);
    expect(ocCity.components.lightPollution.score).toBeGreaterThan(
      rnCity.components.lightPollution.score + 20,
    );
    expect(rnCity.reasons.some((r) => r.code === 'lp.bright')).toBe(true);
  });
  it('manual SQM overrides atlas estimates', () => {
    const sky = resolveSiteSky({ sqmManual: 21.5, bortleManual: 8, atlasSqm: 18 });
    expect(sky.source).toBe('sqm-manual');
    expect(sky.sqm).toBe(21.5);
  });
});

describe('Filters and camera modification for emission nebulae', () => {
  const dualBand: RigInput = {
    ...SAMPLE_RIG,
    filters: [{ id: 'db', spec: { kind: 'dual-band' } }],
  };
  const modified: RigInput = {
    ...SAMPLE_RIG,
    camera: { ...SAMPLE_RIG.camera, modification: 'astro-modified' },
  };
  it('a dual-band filter improves an emission nebula under Bortle 8', () => {
    const none = evalT(TARGETS.NGC7000, ctx(NEW_MOON_NIGHT, 8));
    const filt = evalT(TARGETS.NGC7000, ctx(NEW_MOON_NIGHT, 8), dualBand);
    expect(filt.filterKind).toBe('dual-band');
    expect(filt.components.lightPollution.score).toBeGreaterThan(
      none.components.lightPollution.score + 15,
    );
    expect(filt.integration!.recommendedH).toBeLessThan(none.integration!.recommendedH);
  });
  it('the engine does not pick a dual-band filter for a galaxy', () => {
    const gal = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 8), dualBand);
    expect(gal.filterKind).toBe('none');
  });
  it('a stock DSLR is penalised for emission targets, a modified one is not', () => {
    const stock = evalT(TARGETS.NGC7000, ctx(NEW_MOON_NIGHT, 4));
    const mod = evalT(TARGETS.NGC7000, ctx(NEW_MOON_NIGHT, 4), modified);
    expect(stock.components.cameraFilter.score).toBeLessThan(70);
    expect(mod.components.cameraFilter.score).toBe(100);
    expect(stock.integration!.recommendedH).toBeGreaterThan(mod.integration!.recommendedH);
  });
});

describe('Hard constraints', () => {
  it('a target that stays below the minimum altitude scores 0', () => {
    const ev = evalT(TARGETS.OMEGA_CEN, ctx(NEW_MOON_NIGHT, 4));
    expect(ev.hardConstraints).toContain('below-min-altitude');
    expect(ev.score).toBe(0);
    expect(ev.scoreClass).toBe('unsuitable');
  });
  it('a target that never rises scores 0', () => {
    const ev = evalT({ ...TARGETS.OMEGA_CEN, id: 'x', decDeg: -80 }, ctx(NEW_MOON_NIGHT, 4));
    expect(ev.hardConstraints).toContain('never-rises');
    expect(ev.score).toBe(0);
  });
  it('a target too small for the equipment is capped as unsuitable', () => {
    const ev = evalT(TARGETS.TINY_GALAXY, ctx(NEW_MOON_NIGHT, 3));
    expect(ev.hardConstraints).toContain('too-small');
    expect(ev.score).toBeLessThan(40);
    expect(ev.scoreClass).toBe('unsuitable');
  });
  it('M57 is effectively too small for a 200 mm camera lens', () => {
    const ev = evalT(TARGETS.M57, ctx(NEW_MOON_NIGHT, 4));
    expect(ev.hardConstraints).toContain('too-small');
  });
  it('non-DSO catalogue entries are never scored', () => {
    const ev = evalT(TARGETS.STAR, ctx(NEW_MOON_NIGHT, 4));
    expect(ev.hardConstraints).toContain('not-scored');
    expect(ev.score).toBe(0);
  });
  it('a huge target with only a telescope suggests a mosaic', () => {
    const scopeRig: RigInput = {
      ...SAMPLE_RIG,
      optics: [{ id: 'scope', spec: { kind: 'telescope', focalLengthMm: 1000, apertureMm: 200 } }],
    };
    const ev = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 4), scopeRig);
    expect(ev.optics!.framing.mosaicSuggested).toBe(true);
    expect(ev.hardConstraints).toContain('too-large');
    expect(ev.reasons.some((r) => r.code === 'framing.mosaic')).toBe(true);
  });
});

describe('Fixed tripod vs tracking', () => {
  it('fixed tripod lowers the tracking/exposure component and uses NPF limits', () => {
    const tr = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 4));
    const fx = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 4, { exposureMode: 'fixed' }));
    expect(fx.maxSubSource).toBe('npf');
    expect(fx.maxSubS!).toBeLessThan(10);
    expect(fx.components.trackingExposure.score).toBeLessThan(tr.components.trackingExposure.score);
  });
  it('uses mount calibration when available', () => {
    const cal: RigInput = {
      ...SAMPLE_RIG,
      mount: {
        ...SAMPLE_RIG.mount,
        calibration: [
          { focalLengthMm: 50, reliableExposureS: 180 },
          { focalLengthMm: 200, reliableExposureS: 45 },
        ],
      },
    };
    const ev = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 4), cal);
    expect(['calibrated', 'interpolated']).toContain(ev.maxSubSource);
    expect(ev.confidence.factors).not.toContain('trackingUncalibrated');
  });
});

describe('Time availability and Tonight Score', () => {
  const ev = evalT(TARGETS.M33, ctx(NEW_MOON_NIGHT, 6));
  it('an insufficient imaging window lowers the Tonight Score via the time multiplier', () => {
    const full = tonightScore(ev, null, DEFAULT_SCORING_SETTINGS, {
      availableHours: null,
      weatherEnabled: true,
    });
    const short = tonightScore(ev, null, DEFAULT_SCORING_SETTINGS, {
      availableHours: 0.5,
      weatherEnabled: true,
    });
    expect(short.timeMultiplier).toBeLessThan(full.timeMultiplier);
    expect(short.score).toBeLessThan(full.score);
    expect(full.weatherStatus).toBe('unavailable');
  });
  it('time multiplier follows the documented table', () => {
    expect(timeMultiplier(4, 4)).toBe(1);
    expect(timeMultiplier(3.2, 4)).toBe(0.95);
    expect(timeMultiplier(2.4, 4)).toBe(0.85);
    expect(timeMultiplier(1.2, 4)).toBe(0.65);
    expect(timeMultiplier(0.5, 4)).toBe(0.4);
  });
  it('weather multiplier follows the documented table', () => {
    expect(weatherMultiplier(95)).toBe(1);
    expect(weatherMultiplier(85)).toBe(0.95);
    expect(weatherMultiplier(75)).toBe(0.88);
    expect(weatherMultiplier(65)).toBe(0.78);
    expect(weatherMultiplier(55)).toBe(0.65);
    expect(weatherMultiplier(45)).toBe(0.5);
    expect(weatherMultiplier(35)).toBe(0.35);
    expect(weatherMultiplier(10)).toBe(0.15);
    expect(weatherMultiplier(75, 'strict')).toBeLessThan(weatherMultiplier(75));
  });
  function hours(overrides: Partial<HourlyWeather>): ReturnType<typeof scoreHour>[] {
    const out = [];
    const start = ev.window!.startMs;
    for (let t = start; t < ev.window!.endMs; t += MS_PER_HOUR) {
      out.push(
        scoreHour({
          timeMs: t,
          cloudTotal: 5,
          cloudLow: 0,
          cloudMid: 0,
          cloudHigh: 5,
          temperatureC: 12,
          humidityPct: 60,
          dewPointC: 4,
          precipProbabilityPct: 0,
          precipMm: 0,
          visibilityM: 30000,
          windKmh: 5,
          gustKmh: 10,
          weatherCode: 0,
          ...overrides,
        }),
      );
    }
    return out;
  }
  it('bad weather cannot be averaged away (multiplicative)', () => {
    const clear = tonightScore(ev, hours({}), DEFAULT_SCORING_SETTINGS, {
      availableHours: null,
      weatherEnabled: true,
    });
    const cloudy = tonightScore(ev, hours({ cloudTotal: 90 }), DEFAULT_SCORING_SETTINGS, {
      availableHours: null,
      weatherEnabled: true,
    });
    expect(clear.weatherStatus).toBe('included');
    expect(clear.weatherMultiplier).toBe(1);
    expect(cloudy.score).toBeLessThan(clear.score * 0.5);
  });
  it('hard-stop weather zeroes the Tonight Score', () => {
    const rain = tonightScore(
      ev,
      hours({ precipMm: 1.2, weatherCode: 63 }),
      DEFAULT_SCORING_SETTINGS,
      { availableHours: null, weatherEnabled: true },
    );
    expect(rain.weatherStatus).toBe('hard-stop');
    expect(rain.score).toBe(0);
  });
  it('dates beyond the forecast are flagged, not guessed', () => {
    const r = tonightScore(ev, hours({}), DEFAULT_SCORING_SETTINGS, {
      availableHours: null,
      weatherEnabled: true,
      forecastEndMs: ev.window!.startMs - 1,
    });
    expect(r.weatherStatus).toBe('beyond-forecast');
    expect(r.weatherMultiplier).toBe(1);
  });
});

describe('"Now" mode', () => {
  it('evaluates from the given instant onward', () => {
    const g = grid(NEW_MOON_NIGHT);
    const late = g.night.astroDawnMs! - 1.5 * MS_PER_HOUR;
    const tonight = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 5));
    const now = evalT(TARGETS.M31, ctx(NEW_MOON_NIGHT, 5, { timeMode: 'now', nowMs: late }));
    expect(now.usableHours).toBeLessThan(tonight.usableHours);
    expect(now.window!.startMs).toBeGreaterThanOrEqual(late - 10 * 60_000);
  });
});

describe('classification', () => {
  it('maps scores to classes', () => {
    expect(classifyScore(85)).toBe('recommended');
    expect(classifyScore(70)).toBe('worth-trying');
    expect(classifyScore(45)).toBe('difficult');
    expect(classifyScore(10)).toBe('unsuitable');
  });
});
