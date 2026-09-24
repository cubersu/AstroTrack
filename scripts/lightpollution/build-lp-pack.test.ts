import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeArrayBuffer } from 'geotiff';
import { buildLpPack, parseRegion } from './build-lp-pack';
import { decodeLpGrid, sampleLpGrid } from '../../src/data/lightPollutionFormat';

describe('light-pollution pack builder (synthetic GeoTIFF)', () => {
  it('produces a valid, registered, installable grid', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lp-'));
    // 0.01° pixels covering 28–32°E, 39–42°N, with a bright "city" at 29.0°E 41.0°N.
    const W = 400;
    const H = 300;
    const data = new Float32Array(W * H).fill(0.2);
    for (let y = 95; y < 105; y++) for (let x = 95; x < 105; x++) data[y * W + x] = 80;
    const buf = await writeArrayBuffer(data, {
      width: W,
      height: H,
      ModelPixelScale: [0.01, 0.01, 0],
      ModelTiepoint: [0, 0, 0, 28, 42, 0],
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
      GTRasterTypeGeoKey: 1,
      SampleFormat: [3],
      BitsPerSample: [32],
    });
    const tif = join(dir, 'in.tif');
    writeFileSync(tif, Buffer.from(buf));
    const m = await buildLpPack({
      input: tif,
      region: parseRegion('test:28.5,40,31.5,41.5'),
      res: 0.02,
      outRoot: dir,
    });
    expect(m.kind).toBe('light-pollution');
    expect(m.region?.name).toBe('test');
    const grid = decodeLpGrid(
      readFileSync(join(dir, 'packs', 'lp-test', 'grid.bin')).buffer as ArrayBuffer,
    );
    const city = sampleLpGrid(grid, 41.0, 29.0)!;
    const far = sampleLpGrid(grid, 40.2, 31.3)!;
    expect(city).toBeLessThan(far);
    expect(far).toBeGreaterThan(20.5);
    const reg = JSON.parse(readFileSync(join(dir, 'packs.json'), 'utf8'));
    expect(reg.packs.map((p: { id: string }) => p.id)).toContain('lp-test');
    expect(() => parseRegion('bad')).toThrow();
  }, 60_000);
});
