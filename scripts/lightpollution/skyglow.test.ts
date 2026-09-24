import { describe, expect, it } from 'vitest';
import { fitCalibration, indexToSqm, resample, skyglowIndex, NATURAL_SQM } from './skyglow';
import type { Raster } from './skyglow';

function raster(
  width: number,
  height: number,
  west: number,
  south: number,
  res: number,
  fill = 0,
): Raster {
  return {
    width,
    height,
    west,
    south,
    east: west + width * res,
    north: south + height * res,
    data: new Float32Array(width * height).fill(fill),
  };
}

describe('light-pollution estimation pipeline', () => {
  it('area-averages onto the output grid', () => {
    const r = raster(4, 4, 0, 0, 0.5, 1);
    r.data[0] = 5; // north-west corner cell
    const g = resample(r, { west: 0, south: 0, east: 2, north: 2 }, 1);
    expect(g.width).toBe(2);
    expect(g.data[0]).toBeCloseTo((5 + 1 + 1 + 1) / 4, 6);
    expect(g.data[3]).toBeCloseTo(1, 6);
  });
  it('skyglow decays with distance from a city and stays natural far away', () => {
    const res = 0.02;
    const g = raster(300, 150, 30, 38, res, 0);
    // A 10×10-cell "city" of radiance 50 near the west edge.
    for (let y = 70; y < 80; y++) for (let x = 20; x < 30; x++) g.data[y * g.width + x] = 50;
    const idx = skyglowIndex(g);
    const at = (x: number) => idx[75 * g.width + x];
    expect(at(25)).toBeGreaterThan(at(60));
    expect(at(60)).toBeGreaterThan(at(120));
    expect(at(120)).toBeGreaterThan(at(290) - 1e-9);
    expect(indexToSqm(at(25))).toBeLessThan(19.5);
    expect(indexToSqm(at(290))).toBeGreaterThan(21.5);
    expect(indexToSqm(0)).toBe(NATURAL_SQM);
  });
  it('fits the calibration constant from SQM measurements', () => {
    const c = 0.35;
    const pts = [1, 10, 100].map((index) => ({ index, sqm: indexToSqm(index, c) }));
    expect(fitCalibration(pts)!).toBeCloseTo(c, 6);
    expect(fitCalibration([{ index: 0, sqm: 22 }])).toBeNull();
  });
});
