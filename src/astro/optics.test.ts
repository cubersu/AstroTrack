import { describe, expect, it } from 'vitest';
import { angularFovDeg, fieldOfView, focalLengthForFov } from './fieldOfView';
import {
  altAzFieldRotationLimitS,
  effectiveTrailingDec,
  fixedTripodOptions,
  npfSeconds,
  npfSimpleSeconds,
  rule500Seconds,
  trailLengthPx,
} from './npf';
import { airyFwhmArcsec, derivePixelPitchUm, pixelScaleArcsec } from './pixelScale';

// Canon EOS 200D-like APS-C sensor used as a test fixture only.
const W = 22.3;
const H = 14.9;

describe('field of view', () => {
  it('computes rectilinear FOV', () => {
    const fov = fieldOfView(W, H, 50);
    expect(fov.widthDeg).toBeCloseTo(25.14, 2);
    expect(fov.heightDeg).toBeCloseTo(16.95, 2);
    expect(fov.diagonalDeg).toBeCloseTo(30.02, 1);
  });
  it('handles full frame and telescope focal lengths', () => {
    expect(angularFovDeg(36, 50)).toBeCloseTo(39.6, 1);
    // 1000 mm with a 23.5 mm sensor ≈ 1.346°
    expect(angularFovDeg(23.5, 1000)).toBeCloseTo(1.3464, 3);
    // Small-angle agreement: 57.2958 · d / f
    expect(angularFovDeg(10, 2000)).toBeCloseTo((57.29578 * 10) / 2000, 3);
  });
  it('scales inversely with focal length', () => {
    const a = fieldOfView(W, H, 100);
    const b = fieldOfView(W, H, 200);
    expect(a.widthDeg / b.widthDeg).toBeCloseTo(2, 1);
  });
  it('inverts', () => {
    expect(focalLengthForFov(W, angularFovDeg(W, 135))).toBeCloseTo(135, 6);
  });
  it('rejects invalid input', () => {
    expect(Number.isNaN(angularFovDeg(0, 50))).toBe(true);
    expect(Number.isNaN(angularFovDeg(10, -5))).toBe(true);
  });
});

describe('pixel scale', () => {
  it('derives pixel pitch', () => {
    const { pitchUm, consistent } = derivePixelPitchUm(W, H, 6000, 4000);
    expect(pitchUm).toBeCloseTo(3.72, 2);
    expect(consistent).toBe(true);
    expect(derivePixelPitchUm(22.3, 20, 6000, 4000).consistent).toBe(false);
  });
  it('computes arcsec/pixel', () => {
    expect(pixelScaleArcsec(3.72, 50)).toBeCloseTo(15.35, 2);
    expect(pixelScaleArcsec(3.76, 1000)).toBeCloseTo(0.7756, 3);
    expect(pixelScaleArcsec(3.72, 200)).toBeCloseTo(3.837, 2);
  });
  it('computes Airy FWHM', () => {
    // 100 mm at 550 nm → ~1.17″
    expect(airyFwhmArcsec(100)).toBeCloseTo(1.167, 2);
  });
});

describe('NPF rule', () => {
  it('matches the published detailed formula', () => {
    // (16.856·2.8 + 0.0997·24 + 13.713·4.3) / 24 = 4.523 s
    expect(npfSeconds(2.8, 24, 4.3, 0)).toBeCloseTo(4.523, 2);
    expect(npfSimpleSeconds(2.8, 24, 4.3)).toBeCloseTo(9.458, 2);
  });
  it('increases toward the pole by 1/cos δ and clamps near it', () => {
    const eq = npfSeconds(1.8, 50, 3.72, 0);
    expect(npfSeconds(1.8, 50, 3.72, 60) / eq).toBeCloseTo(2, 6);
    expect(npfSeconds(1.8, 50, 3.72, 89)).toBeCloseTo(npfSeconds(1.8, 50, 3.72, 80), 9);
    expect(Number.isFinite(npfSeconds(1.8, 50, 3.72, 90))).toBe(true);
  });
  it('is shorter than the 500 rule on modern sensors', () => {
    expect(npfSeconds(1.8, 50, 3.72, 0)).toBeLessThan(rule500Seconds(50, 1.6));
  });
  it('produces ordered tolerance presets with explicit trail lengths', () => {
    const opts = fixedTripodOptions(1.8, 50, 3.72, 20);
    expect(opts.map((o) => o.tolerance)).toEqual(['safe', 'balanced', 'aggressive']);
    expect(opts[0].exposureS).toBeLessThan(opts[1].exposureS);
    expect(opts[1].exposureS).toBeLessThan(opts[2].exposureS);
    expect(opts[0].trailPx).toBeLessThan(3);
    for (const o of opts) {
      expect(o.trailPx).toBeCloseTo(trailLengthPx(o.exposureS, 50, 3.72, 20), 9);
    }
  });
  it('trail length follows sidereal drift', () => {
    // 10 s at equator, 15.35″/px → 150.4″ / 15.35 ≈ 9.8 px
    expect(trailLengthPx(10, 50, 3.72, 0)).toBeCloseTo(9.8, 1);
  });
  it('uses the frame edge nearest the equator', () => {
    expect(effectiveTrailingDec(41, 10)).toBeCloseTo(36);
    expect(effectiveTrailingDec(-30, 10)).toBeCloseTo(-25);
    expect(effectiveTrailingDec(3, 10)).toBeCloseTo(0);
  });
  it('field rotation is slowest toward east/west and fastest near meridian', () => {
    const merid = altAzFieldRotationLimitS(41, 180, 50, 3600);
    const east = altAzFieldRotationLimitS(41, 90, 50, 3600);
    expect(east).toBeGreaterThan(merid);
  });
});
