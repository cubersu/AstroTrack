import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import { airmass, altitudeForAirmass } from './airmass';
import {
  angularSeparationDeg,
  compassPoint,
  equatorialToHorizontal,
  positionAngleDeg,
} from './coordinates';
import { horizonReference, j2000ToOfDate, lstDeg, precessionMatrix } from './ephemeris';
import { ISTANBUL, SIDING_SPRING } from '../test/fixtures';

describe('equatorial → horizontal', () => {
  const cases = [
    { ra: 10.6847, dec: 41.2687, t: Date.UTC(2026, 9, 15, 21, 0) }, // M31
    { ra: 83.8221, dec: -5.3911, t: Date.UTC(2026, 11, 20, 23, 30) }, // M42
    { ra: 201.365, dec: -43.019, t: Date.UTC(2026, 3, 10, 14, 0) }, // Cen A
    { ra: 279.2347, dec: 38.7837, t: Date.UTC(2026, 6, 1, 0, 0) }, // Vega
  ];
  for (const loc of [ISTANBUL, SIDING_SPRING]) {
    for (const c of cases) {
      it(`matches Astronomy Engine for ra=${c.ra} lat=${loc.latDeg}`, () => {
        const m = precessionMatrix(c.t);
        const p = j2000ToOfDate({ raDeg: c.ra, decDeg: c.dec }, m);
        const mine = equatorialToHorizontal(p.raDeg, p.decDeg, loc.latDeg, lstDeg(c.t, loc.lonDeg));
        const ref = horizonReference(c.t, loc, p.raDeg, p.decDeg, false);
        expect(mine.altDeg).toBeCloseTo(ref.altDeg, 3);
        if (Math.abs(ref.altDeg) < 89) {
          const dAz = Math.abs(((mine.azDeg - ref.azDeg + 540) % 360) - 180);
          expect(dAz).toBeLessThan(0.01);
        }
      });
    }
  }

  it('precession matrix matches Astronomy Engine RotateVector', () => {
    const t = Date.UTC(2030, 0, 1);
    const rot = A.Rotation_EQJ_EQD(new Date(t));
    const sph = new A.Spherical(20, 50, 1);
    const vec = A.VectorFromSphere(sph, A.MakeTime(new Date(t)));
    const refVec = A.RotateVector(rot, vec);
    const refSph = A.SphereFromVector(refVec);
    const mine = j2000ToOfDate({ raDeg: 50, decDeg: 20 }, precessionMatrix(t));
    expect(mine.raDeg).toBeCloseTo(refSph.lon, 6);
    expect(mine.decDeg).toBeCloseTo(refSph.lat, 6);
    // Precession over 30 years is ~0.4°; make sure we actually moved.
    expect(Math.abs(mine.raDeg - 50)).toBeGreaterThan(0.2);
  });
});

describe('angular separation and position angle', () => {
  it('computes known separations', () => {
    expect(angularSeparationDeg(0, 0, 90, 0)).toBeCloseTo(90, 9);
    expect(angularSeparationDeg(0, 89, 180, 89)).toBeCloseTo(2, 9);
    // M31 ↔ M33 ≈ 14.8°
    expect(angularSeparationDeg(10.6847, 41.2687, 23.4621, 30.6599)).toBeCloseTo(14.77, 1);
    // Very small separations remain accurate.
    expect(angularSeparationDeg(100, 20, 100, 20 + 1 / 3600)).toBeCloseTo(1 / 3600, 9);
  });
  it('matches Astronomy Engine AngleBetween', () => {
    const t = A.MakeTime(new Date(Date.UTC(2026, 0, 1)));
    const v1 = A.VectorFromSphere(new A.Spherical(-20, 300, 1), t);
    const v2 = A.VectorFromSphere(new A.Spherical(35, 12, 1), t);
    expect(angularSeparationDeg(300, -20, 12, 35)).toBeCloseTo(A.AngleBetween(v1, v2), 8);
  });
  it('computes position angles', () => {
    expect(positionAngleDeg(0, 0, 0, 1)).toBeCloseTo(0, 6); // north
    expect(positionAngleDeg(0, 0, 1, 0)).toBeCloseTo(90, 6); // east
  });
  it('maps azimuths to compass points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(95)).toBe('E');
    expect(compassPoint(200)).toBe('SSW');
    expect(compassPoint(359)).toBe('N');
  });
});

describe('airmass (Kasten & Young 1989)', () => {
  it('is 1 at zenith and ~2 at 30°', () => {
    expect(airmass(90)).toBeCloseTo(1, 3);
    expect(airmass(30)).toBeCloseTo(1.994, 2);
    expect(airmass(0)).toBe(Number.POSITIVE_INFINITY);
  });
  it('matches published tabulated values', () => {
    // Kasten & Young table: Z=60° → 1.9942 ; Z=80° → 5.6040 ; Z=85° → 10.3163
    expect(airmass(10)).toBeCloseTo(5.6, 1);
    expect(airmass(5)).toBeCloseTo(10.3, 1);
  });
  it('inverts', () => {
    expect(altitudeForAirmass(2)).toBeCloseTo(29.9, 1);
    expect(airmass(altitudeForAirmass(1.5))).toBeCloseTo(1.5, 4);
  });
});
