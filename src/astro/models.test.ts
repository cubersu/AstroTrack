import { describe, expect, it } from 'vitest';
import {
  bestFocalLength,
  evaluateFraming,
  fillFraction,
  framingScoreFromFill,
  suggestedRotation,
} from './framing';
import {
  bortleToSqm,
  customFilterTransmission,
  resolveSiteSky,
  sqmToBortle,
  backgroundDegradation,
  degradationScore,
} from './lightPollution';
import { moonBrighteningMag, moonIlluminanceKs, moonSkyBrightnessNl } from './moonImpact';
import { magArcsec2ToNanoLambert, nanoLambertToMagArcsec2 } from './skyBrightness';
import { deriveSurfaceBrightness, resolveSurfaceBrightness } from './surfaceBrightness';
import { integrationGuidance, relativeSnr } from './integration';
import { interpolateCalibration, trackingLimit } from './tracking';
import {
  niceExposure,
  recommendSubExposure,
  skyElectronRate,
  suggestFromTestFrame,
  isoGuidance,
} from './exposure';
import { maxApertureFNumber, workingAperture, cropFactor } from './equipment';
import { SAMPLE_RIG } from '../test/fixtures';

const APSC = { widthMm: 22.3, heightMm: 14.9, pixelPitchUm: 3.72 };
const FF = { widthMm: 36, heightMm: 24, pixelPitchUm: 5.9 };
const SMALL = { widthMm: 7.4, heightMm: 5.0, pixelPitchUm: 2.9 }; // IMX178-class

describe('framing', () => {
  it('fill uses the long side for the major axis after rotation', () => {
    expect(fillFraction({ majorArcmin: 60, minorArcmin: 30 }, 4, 2)).toBeCloseTo(0.25, 6);
    expect(fillFraction({ majorArcmin: 60, minorArcmin: 60 }, 4, 2)).toBeCloseTo(0.5, 6);
  });
  it('scores fill according to style', () => {
    expect(framingScoreFromFill(0.55, 'balanced')).toBe(100);
    expect(framingScoreFromFill(0.3, 'wide')).toBe(100);
    expect(framingScoreFromFill(0.8, 'tight')).toBe(100);
    expect(framingScoreFromFill(0.05, 'balanced')).toBeLessThan(40);
    expect(framingScoreFromFill(1.5, 'balanced')).toBeLessThan(40);
  });
  it('recommends shorter focal lengths for larger sensors', () => {
    const t = { majorArcmin: 60, minorArcmin: 40 };
    const a = bestFocalLength(t, APSC, 10, 2000, 'balanced');
    const b = bestFocalLength(t, FF, 10, 2000, 'balanced');
    const c = bestFocalLength(t, SMALL, 10, 2000, 'balanced');
    expect(b.focalLengthMm).toBeGreaterThan(a.focalLengthMm);
    expect(a.focalLengthMm).toBeGreaterThan(c.focalLengthMm);
    for (const r of [a, b, c]) expect(r.fill).toBeCloseTo(0.55, 1);
  });
  it('respects the zoom range and style', () => {
    const t = { majorArcmin: 10 };
    const r = bestFocalLength(t, APSC, 18, 200, 'balanced');
    expect(r.focalLengthMm).toBe(200);
    const wide = bestFocalLength({ majorArcmin: 120 }, APSC, 18, 200, 'wide');
    const tight = bestFocalLength({ majorArcmin: 120 }, APSC, 18, 200, 'tight');
    expect(tight.focalLengthMm).toBeGreaterThan(wide.focalLengthMm);
  });
  it('flags too small and mosaic targets', () => {
    expect(evaluateFraming({ majorArcmin: 1 }, APSC, 200, 'balanced').tooSmall).toBe(true);
    const big = evaluateFraming({ majorArcmin: 180, minorArcmin: 60 }, APSC, 1000, 'balanced');
    expect(big.mosaicSuggested).toBe(true);
    expect(big.tooLarge).toBe(true);
  });
  it('suggests rotation from the position angle', () => {
    expect(
      suggestedRotation({ majorArcmin: 10, minorArcmin: 3, positionAngleDeg: 90 }).orientation,
    ).toBe('landscape');
    expect(
      suggestedRotation({ majorArcmin: 10, minorArcmin: 3, positionAngleDeg: 175 }).orientation,
    ).toBe('portrait');
    expect(suggestedRotation({ majorArcmin: 10, minorArcmin: 3, positionAngleDeg: 35 })).toEqual({
      rotationDeg: 35,
      orientation: 'angled',
    });
    expect(
      suggestedRotation({ majorArcmin: 10, minorArcmin: 9.5, positionAngleDeg: 35 }).orientation,
    ).toBe('any');
    expect(
      suggestedRotation({ majorArcmin: 10, minorArcmin: 3, positionAngleDeg: 215 }).rotationDeg,
    ).toBe(35);
  });
});

describe('light-pollution conversions', () => {
  it('maps Bortle ↔ SQM approximately and monotonically', () => {
    for (let b = 1; b <= 9; b++) expect(sqmToBortle(bortleToSqm(b))).toBe(b);
    expect(sqmToBortle(22)).toBe(1);
    expect(sqmToBortle(17)).toBe(9);
  });
  it('resolves priority: SQM > Bortle > atlas > assumed', () => {
    expect(resolveSiteSky({ bortleManual: 6, atlasSqm: 21 }).source).toBe('bortle-manual');
    expect(resolveSiteSky({ atlasSqm: 21 }).source).toBe('atlas-estimate');
    expect(resolveSiteSky({}).source).toBe('assumed');
  });
  it('degradation factor is 1 at the reference and grows with sky brightness', () => {
    expect(backgroundDegradation(1, 1, 0.5)).toBe(1);
    expect(backgroundDegradation(10, 1, 0.5)).toBeGreaterThan(5);
    expect(degradationScore(1, 0.5)).toBe(100);
    expect(degradationScore(16, 0.5)).toBeCloseTo(25, 6);
  });
  it('custom filter bandwidths are modelled explicitly', () => {
    const ha7 = customFilterTransmission([{ centerNm: 656.3, bandwidthNm: 7 }], 'emission');
    expect(ha7.known).toBe(true);
    expect(ha7.sky).toBeLessThan(0.05);
    expect(ha7.signal).toBeGreaterThan(0.3);
    expect(customFilterTransmission(undefined, 'emission').known).toBe(false);
  });
});

describe('Krisciunas & Schaefer moon model', () => {
  it('converts nL ↔ mag/arcsec²', () => {
    expect(nanoLambertToMagArcsec2(magArcsec2ToNanoLambert(21.5))).toBeCloseTo(21.5, 9);
    // K&S (1991): the Mauna Kea dark sky, V = 21.587 mag/arcsec², corresponds to 79.0 nL.
    expect(magArcsec2ToNanoLambert(21.587)).toBeCloseTo(79.0, 1);
  });
  it('the full Moon is ~10× brighter than the quarter Moon', () => {
    const r = moonIlluminanceKs(0) / moonIlluminanceKs(90);
    expect(r).toBeGreaterThan(8);
    expect(r).toBeLessThan(16);
  });
  it('a full Moon 30° from the target gives a sky around 17–18 mag/arcsec²', () => {
    const b = moonSkyBrightnessNl(0, 30, 45, 45, 0.172);
    const v = nanoLambertToMagArcsec2(b);
    expect(v).toBeGreaterThan(16.5);
    expect(v).toBeLessThan(18.5);
  });
  it('is zero when the Moon is down and decreases with separation', () => {
    expect(moonSkyBrightnessNl(0, 60, -5, 50)).toBe(0);
    const near = moonSkyBrightnessNl(20, 20, 40, 40);
    const far = moonSkyBrightnessNl(20, 90, 40, 40);
    expect(near).toBeGreaterThan(far);
    expect(moonBrighteningMag(magArcsec2ToNanoLambert(21.5), far)).toBeGreaterThan(1);
  });
});

describe('surface brightness', () => {
  it('derives SB from magnitude and size', () => {
    // mag 10, 1'×1' → area π/4·3600 = 2827 arcsec² → +8.63
    expect(deriveSurfaceBrightness(10, 1, 1)).toBeCloseTo(18.63, 2);
  });
  it('prefers catalogue SB, then derived, then assumed', () => {
    expect(resolveSurfaceBrightness({ type: 'galaxy', sbCatalogue: 23, sbBand: 'B' })).toEqual({
      sbV: 22.2,
      basis: 'catalogue',
    });
    expect(
      resolveSurfaceBrightness({
        type: 'planetary-nebula',
        magV: 8.8,
        majorArcmin: 1.4,
        minorArcmin: 1,
      }).basis,
    ).toBe('derived');
    expect(resolveSurfaceBrightness({ type: 'dark-nebula' }).basis).toBe('assumed');
  });
});

describe('integration guidance', () => {
  const baseIn = {
    type: 'galaxy' as const,
    sbV: 22,
    siteSqm: 21.1,
    moonRelFlux: 0,
    meanAirmass: 1,
    extinctionK: 0.25,
    fNumber: 5,
    transmission: { signal: 1, sky: 1 },
    mono: false,
  };
  it('matches the base value under reference conditions', () => {
    const r = integrationGuidance(baseIn);
    expect(r.recommendedH).toBeCloseTo(2, 6);
    expect(r.minimumH).toBeCloseTo(0.6, 6);
    expect(r.idealH).toBeCloseTo(6, 6);
  });
  it('grows with sky brightness, f-ratio and faintness', () => {
    const r0 = integrationGuidance(baseIn).recommendedH;
    expect(integrationGuidance({ ...baseIn, siteSqm: 18.5 }).recommendedH).toBeGreaterThan(r0 * 2);
    expect(integrationGuidance({ ...baseIn, fNumber: 7 }).recommendedH).toBeCloseTo(
      r0 * (7 / 5) ** 2,
      4,
    );
    expect(integrationGuidance({ ...baseIn, sbV: 23 }).recommendedH).toBeGreaterThan(r0);
  });
  it('SNR scales with the square root of time', () => {
    expect(relativeSnr(4, 1)).toBe(2);
  });
});

describe('tracking calibration', () => {
  const pts = [
    { focalLengthMm: 50, reliableExposureS: 240 },
    { focalLengthMm: 100, reliableExposureS: 120 },
    { focalLengthMm: 200, reliableExposureS: 45 },
  ];
  it('returns calibrated values and log-log interpolation', () => {
    expect(interpolateCalibration(pts, 100)).toEqual({ seconds: 120, source: 'calibrated' });
    const mid = interpolateCalibration(pts, 141.4)!;
    expect(mid.source).toBe('interpolated');
    expect(mid.seconds).toBeGreaterThan(45);
    expect(mid.seconds).toBeLessThan(120);
  });
  it('extrapolates cautiously with t ∝ 1/f and flags far extrapolation', () => {
    expect(interpolateCalibration(pts, 300)).toEqual({ seconds: 30, source: 'extrapolated' });
    expect(interpolateCalibration(pts, 600)!.source).toBe('extrapolated-far');
  });
  it('falls back to a labelled default without calibration', () => {
    expect(trackingLimit({ tracking: true, equatorial: true, guiding: false }, 200)).toEqual({
      seconds: 60,
      source: 'default-unguided',
    });
    expect(trackingLimit({ tracking: false, equatorial: false, guiding: false }, 200).seconds).toBe(
      0,
    );
  });
});

describe('exposure', () => {
  it('rounds to practical exposure values', () => {
    expect(niceExposure(62)).toBe(60);
    expect(niceExposure(0.33)).toBe(0.3);
  });
  it('sky electron rate scales with aperture area and sky brightness', () => {
    const a = skyElectronRate({
      sqm: 20,
      focalMm: 200,
      fNumber: 4,
      pixelPitchUm: 3.72,
      color: true,
    });
    const b = skyElectronRate({
      sqm: 19,
      focalMm: 200,
      fNumber: 4,
      pixelPitchUm: 3.72,
      color: true,
    });
    expect(b / a).toBeCloseTo(10 ** 0.4, 6);
    const c = skyElectronRate({
      sqm: 20,
      focalMm: 200,
      fNumber: 2.8,
      pixelPitchUm: 3.72,
      color: true,
    });
    expect(c / a).toBeCloseTo((4 / 2.8) ** 2, 6);
  });
  it('uses read noise when known and labels the result physical', () => {
    const cam = { ...SAMPLE_RIG.camera, advanced: { readNoiseE: 3 } };
    const r = recommendSubExposure({
      camera: cam,
      focalMm: 200,
      fNumber: 5.6,
      sqmEffective: 20,
      skyTransmission: 1,
      maxFromMountS: 600,
      mountLimitReason: 'tracking',
    });
    expect(r.physical).toBe(true);
    expect(r.limitedBy).toBe('sky-limited');
    expect(r.skyLimitedS!).toBeGreaterThan(30);
  });
  it('is capped by the mount limit', () => {
    const r = recommendSubExposure({
      camera: SAMPLE_RIG.camera,
      focalMm: 200,
      fNumber: 5.6,
      sqmEffective: 21.5,
      skyTransmission: 1,
      maxFromMountS: 20,
      mountLimitReason: 'tracking',
    });
    expect(r.recommendedS).toBeLessThanOrEqual(20);
    expect(r.limitedBy).toBe('tracking');
    expect(r.physical).toBe(false);
  });
  it('gives ISO ranges, never a single inferred ISO', () => {
    const g = isoGuidance(SAMPLE_RIG.camera, 20);
    expect(g.kind).toBe('iso');
    expect(g.isoMin).toBeLessThan(g.isoMax!);
    expect(g.approximate).toBe(true);
  });
  it('calibration workflow suggestions are explainable', () => {
    expect(
      suggestFromTestFrame(60, { histogram: '<5', stars: 'round', clipping: 'none' }).suggestedS,
    ).toBe(120);
    const trail = suggestFromTestFrame(60, { histogram: '<5', stars: 'obvious', clipping: 'none' });
    expect(trail.suggestedS).toBe(30);
    expect(trail.advice).toContain('trailing-obvious');
    expect(
      suggestFromTestFrame(60, { histogram: '>30', stars: 'round', clipping: 'excessive' })
        .suggestedS,
    ).toBe(30);
    const capped = suggestFromTestFrame(
      60,
      { histogram: '<5', stars: 'round', clipping: 'none' },
      90,
    );
    expect(capped.suggestedS).toBe(90);
    expect(capped.advice).toContain('limited-by-mount');
  });
});

describe('equipment helpers', () => {
  it('derives f-number from aperture and interpolates variable-aperture zooms', () => {
    expect(
      maxApertureFNumber({ kind: 'telescope', focalLengthMm: 1000, apertureMm: 200 }, 1000),
    ).toBe(5);
    const z = {
      kind: 'lens' as const,
      focalLengthMm: 18,
      focalLengthMaxMm: 200,
      fNumber: 3.5,
      fNumberAtMax: 6.3,
    };
    expect(maxApertureFNumber(z, 18)).toBe(3.5);
    expect(maxApertureFNumber(z, 200)).toBeCloseTo(6.3, 6);
    const mid = maxApertureFNumber(z, 60)!;
    expect(mid).toBeGreaterThan(3.5);
    expect(mid).toBeLessThan(6.3);
  });
  it('stops fast lenses down automatically and warns about aberrations', () => {
    const a = workingAperture({ kind: 'lens', focalLengthMm: 50, fNumber: 1.8 }, 50)!;
    expect(a.fNumber).toBe(2.8);
    expect(a.warnAberrations).toBe(true);
    const t = workingAperture(
      { kind: 'telescope', focalLengthMm: 600, apertureMm: 120, multiplier: 0.8 },
      600,
    )!;
    expect(t.fNumber).toBeCloseTo(4, 6);
    const u = workingAperture(
      { kind: 'lens', focalLengthMm: 50, fNumber: 1.8, preferredFNumber: 2.2 },
      50,
    )!;
    expect(u).toEqual({ fNumber: 2.2, basis: 'user', warnAberrations: false });
  });
  it('computes crop factor', () => {
    expect(cropFactor({ sensorWidthMm: 22.3, sensorHeightMm: 14.9 })).toBeCloseTo(1.61, 2);
  });
});
