import { describe, expect, it } from 'vitest';
import type { OpticsSpec } from './equipment';
import { apertureStops, maxApertureFNumber, pinOptics, workingAperture } from './equipment';

const ZOOM: OpticsSpec = {
  kind: 'lens',
  focalLengthMm: 18,
  focalLengthMaxMm: 200,
  fNumber: 3.5,
  fNumberAtMax: 6.3,
};
const PRIME: OpticsSpec = { kind: 'lens', focalLengthMm: 135, fNumber: 2 };
const SCOPE: OpticsSpec = { kind: 'telescope', focalLengthMm: 250, apertureMm: 51 };

describe('pinOptics', () => {
  it('turns a zoom into a prime at the chosen focal length with the matching max aperture', () => {
    const p = pinOptics(ZOOM, 85, null);
    expect(p.focalLengthMm).toBe(85);
    expect(p.focalLengthMaxMm).toBeNull();
    expect(p.fNumber).toBeCloseTo(maxApertureFNumber(ZOOM, 85)!, 6);
    expect(workingAperture(p, 85)?.basis).not.toBe('user');
  });
  it('clamps the focal length to the zoom range', () => {
    expect(pinOptics(ZOOM, 10, null).focalLengthMm).toBe(18);
    expect(pinOptics(ZOOM, 400, null).focalLengthMm).toBe(200);
  });
  it('keeps the zoom range when no focal length is pinned', () => {
    const p = pinOptics(ZOOM, null, 8);
    expect(p.focalLengthMm).toBe(18);
    expect(p.focalLengthMaxMm).toBe(200);
    expect(p.preferredFNumber).toBe(8);
  });
  it('applies a chosen aperture as the preferred f-number (working aperture honours it)', () => {
    const p = pinOptics(PRIME, 135, 2.8);
    const ap = workingAperture(p, 135)!;
    expect(ap.basis).toBe('user');
    expect(ap.fNumber).toBe(2.8);
  });
  it('converts effective values through a reducer/Barlow multiplier', () => {
    const reduced: OpticsSpec = { ...PRIME, multiplier: 0.8 };
    const p = pinOptics(reduced, 108, 2.4);
    expect(p.focalLengthMm).toBeCloseTo(135, 6);
    expect(p.preferredFNumber).toBeCloseTo(3, 6);
  });
  it('never sets a user aperture on a telescope (fixed focal ratio)', () => {
    const p = pinOptics(SCOPE, 250, 8);
    expect(p.preferredFNumber).toBeUndefined();
    expect(workingAperture(p, 250)?.fNumber).toBeCloseTo(250 / 51, 6);
  });
});

describe('apertureStops', () => {
  it('lists standard stops from the maximum aperture down to f/11', () => {
    const s = apertureStops(PRIME, 135);
    expect(s[0]).toBe(2);
    expect(s).toContain(2.8);
    expect(s[s.length - 1]).toBe(11);
  });
  it('starts at the interpolated maximum aperture of a variable-aperture zoom', () => {
    const nMax = maxApertureFNumber(ZOOM, 200)!;
    expect(apertureStops(ZOOM, 200)[0]).toBeGreaterThanOrEqual(nMax - 1e-9);
  });
  it('returns the single native ratio for telescopes and nothing without aperture data', () => {
    expect(apertureStops(SCOPE, 250)).toEqual([250 / 51]);
    expect(apertureStops({ kind: 'lens', focalLengthMm: 50 }, 50)).toEqual([]);
  });
});
