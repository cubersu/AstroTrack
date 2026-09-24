import { describe, expect, it } from 'vitest';
import { angularSeparationDeg } from './coordinates';
import {
  ang2pixNest,
  degradeNest,
  maxPixelRadiusDeg,
  npix,
  pix2angNest,
  pixToRadec,
  queryDiscInclusive,
  radecToPix,
} from './healpix';

describe('HEALPix nested', () => {
  it('base pixels (nside=1) are placed per the standard layout', () => {
    // Face 4 is centred on the equator at φ = 0; faces 0–3 north, 8–11 south.
    expect(ang2pixNest(1, Math.PI / 2, 0.01)).toBe(4);
    expect(ang2pixNest(1, 0.3, Math.PI / 4)).toBe(0);
    expect(ang2pixNest(1, Math.PI - 0.3, Math.PI / 4)).toBe(8);
    const c = pix2angNest(1, 4);
    expect(c.theta).toBeCloseTo(Math.PI / 2, 9);
    expect(c.phi).toBeCloseTo(0, 9);
  });
  it('round-trips: every sampled position lies within its pixel radius', () => {
    for (const nside of [1, 2, 4, 16, 64]) {
      const rmax = maxPixelRadiusDeg(nside);
      for (let i = 0; i < 2000; i++) {
        const ra = (i * 137.508) % 360;
        const dec = Math.asin(2 * ((i * 0.618034) % 1) - 1) * (180 / Math.PI);
        const p = radecToPix(nside, ra, dec);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(npix(nside));
        const c = pixToRadec(nside, p);
        expect(angularSeparationDeg(ra, dec, c.raDeg, c.decDeg)).toBeLessThan(rmax);
      }
    }
  });
  it('pixel centres map back to themselves and all pixels are reachable', () => {
    for (const nside of [1, 4, 8]) {
      for (let p = 0; p < npix(nside); p++) {
        const { theta, phi } = pix2angNest(nside, p);
        expect(ang2pixNest(nside, theta, phi)).toBe(p);
      }
    }
  });
  it('degrading preserves containment', () => {
    const p16 = radecToPix(16, 83.8, -5.4);
    const p4 = radecToPix(4, 83.8, -5.4);
    expect(degradeNest(p16, 4, 2)).toBe(p4);
  });
  it('disc queries include the pixel containing the centre and neighbours', () => {
    const tiles = queryDiscInclusive(4, 10.68, 41.27, 2);
    expect(tiles).toContain(radecToPix(4, 10.68, 41.27));
    expect(tiles.length).toBeLessThan(20);
    const edge = queryDiscInclusive(4, 10.68, 41.27, 2);
    for (let k = 0; k < 50; k++) {
      const a = (k / 50) * 2 * Math.PI;
      const ra = 10.68 + (1.9 * Math.cos(a)) / Math.cos((41.27 * Math.PI) / 180);
      const dec = 41.27 + 1.9 * Math.sin(a);
      expect(edge).toContain(radecToPix(4, ra, dec));
    }
  });
});
