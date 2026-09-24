import { describe, expect, it } from 'vitest';
import {
  decodeLpGrid,
  encodeLpGrid,
  lpValueToSqm,
  sampleLpGrid,
  sqmToLpValue,
} from './lightPollutionFormat';

describe('light-pollution grid format', () => {
  it('quantises SQM values within 0.03 mag', () => {
    for (const s of [16, 18.3, 20.49, 21.9, 22.5])
      expect(lpValueToSqm(sqmToLpValue(s))!).toBeCloseTo(s, 1);
    expect(sqmToLpValue(null)).toBe(0);
    expect(lpValueToSqm(0)).toBeNull();
  });
  it('round-trips and samples with flux-weighted bilinear interpolation', () => {
    const values = new Uint8Array([
      sqmToLpValue(18),
      sqmToLpValue(22),
      sqmToLpValue(18),
      sqmToLpValue(22),
    ]);
    const g = { width: 2, height: 2, west: 0, south: 0, east: 2, north: 2, values };
    const back = decodeLpGrid(encodeLpGrid(g));
    expect(back.width).toBe(2);
    expect(sampleLpGrid(back, 1.5, 0.5)).toBeCloseTo(18, 1);
    const mid = sampleLpGrid(back, 1, 1)!;
    // Flux average of 18 and 22 is much closer to 18 than the magnitude mean (20).
    expect(mid).toBeGreaterThan(18);
    expect(mid).toBeLessThan(19);
    expect(sampleLpGrid(back, 5, 5)).toBeNull();
  });
  it('ignores no-data cells', () => {
    const g = {
      width: 2,
      height: 1,
      west: 0,
      south: 0,
      east: 2,
      north: 1,
      values: new Uint8Array([0, sqmToLpValue(21)]),
    };
    expect(sampleLpGrid(g, 0.5, 1)).toBeCloseTo(21, 1);
    expect(sampleLpGrid({ ...g, values: new Uint8Array([0, 0]) }, 0.5, 1)).toBeNull();
  });
});
