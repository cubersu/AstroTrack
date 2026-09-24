import { describe, expect, it } from 'vitest';
import { gaiaSourceIdToHpx12, degradeNest } from '../../src/astro/healpix';
import { sourceIdRange, tileAdql, toEpoch2000 } from './gaia';

describe('Gaia pack helpers', () => {
  it('computes source_id ranges consistent with the HEALPix encoding', () => {
    const [lo, hi] = sourceIdRange(5, 4);
    expect(degradeNest(gaiaSourceIdToHpx12(lo), 12, 4)).toBe(5);
    expect(degradeNest(gaiaSourceIdToHpx12(hi - 1n), 12, 4)).toBe(5);
    expect(degradeNest(gaiaSourceIdToHpx12(hi), 12, 4)).toBe(6);
  });
  it('builds a bounded ADQL query', () => {
    const q = tileAdql(0, 3, 8, 11);
    expect(q).toContain('gaiadr3.gaia_source');
    expect(q).toContain('phot_g_mean_mag <= 11');
  });
  it('propagates positions to J2000 with proper motion', () => {
    // Barnard's star: μα* ≈ −801.6 mas/yr, μδ ≈ +10362.4 mas/yr (large PM test)
    const [ra, dec] = toEpoch2000(269.44875, 4.7392, -801.551, 10362.394);
    expect(dec).toBeCloseTo(4.7392 - (10362.394 * 16) / 3.6e6, 6);
    expect(ra).toBeGreaterThan(269.44875);
    expect(toEpoch2000(10, 10, null, null)).toEqual([10, 10]);
  });
});
