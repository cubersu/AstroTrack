import { describe, expect, it } from 'vitest';
import { CatalogStore } from './catalogStore';
import { encodeDsoIndex } from './format';
import type { NameRow } from './types';
import { DSO_TYPES } from '../astro/objectTypes';

/** Architecture check: the store must stay fast with 100,000+ objects. */
describe('catalogue scale (synthetic 120,000 objects)', () => {
  const N = 120_000;
  const rows = Array.from({ length: N }, (_, i) => ({
    raDeg: (i * 137.508) % 360,
    decDeg: Math.asin(2 * ((i * 0.618034) % 1) - 1) * (180 / Math.PI),
    majorArcmin: 0.2 + (i % 500) / 10,
    minorArcmin: null,
    positionAngleDeg: null,
    magV: 8 + (i % 80) / 10,
    magB: null,
    sb: null,
    type: DSO_TYPES[i % 14],
    flags: 0,
    constellation: i % 88,
  }));
  const names: NameRow[] = rows.map((_, i) => [
    `syn:${i}`,
    `PGC ${i + 1}`,
    [`XYZ ${i}`],
    i % 97 === 0 ? [`Synthetic cloud ${i}`] : [],
  ]);
  const t0 = performance.now();
  const store = CatalogStore.fromBuffers(encodeDsoIndex(rows), names, 'synthetic');
  const buildMs = performance.now() - t0;

  it('builds the index quickly', () => {
    expect(store.count).toBe(N);
    expect(buildMs).toBeLessThan(5000);
  });
  it('answers searches in milliseconds', () => {
    const t = performance.now();
    for (let k = 0; k < 20; k++) {
      expect(store.search('PGC 1234', 20)[0].name).toBe('PGC 1234');
      store.search('cloud', 50);
    }
    expect((performance.now() - t) / 40).toBeLessThan(50);
  });
  it('filters the full catalogue quickly', () => {
    const t = performance.now();
    const res = store.filterIndices(
      { latitudeDeg: 41, minAltDeg: 20, magMax: 12, sizeMinArcmin: 5 },
      'magnitude',
    );
    expect(res.length).toBeGreaterThan(1000);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});
