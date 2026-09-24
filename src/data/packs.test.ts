import { beforeEach, describe, expect, it } from 'vitest';
import { AstroDataDb, setDataDbForTests, dataDb } from './dataDb';
import { sha256Hex } from './integrity';
import {
  computePackStatuses,
  installPack,
  readPackFile,
  removePack,
  setDataBaseUrl,
  setFetcherForTests,
} from './packs';
import type { PackManifest, PackRegistry } from './packTypes';
import { encodeStars } from '../catalog/format';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

async function makePack(
  version: string,
  stars: number,
): Promise<{ manifest: PackManifest; files: Record<string, ArrayBuffer> }> {
  const bin = encodeStars(
    Array.from({ length: stars }, (_, i) => ({ raDeg: i, decDeg: 0, mag: 9, bv: 0.5 })),
  );
  const json = enc(JSON.stringify({ order: 2 }));
  const files = { 'tiles/0001.bin': bin, 'tiles.json': json };
  const entries = await Promise.all(
    Object.entries(files).map(async ([path, data]) => ({
      path,
      size: data.byteLength,
      sha256: await sha256Hex(data),
    })),
  );
  return {
    files,
    manifest: {
      schema: 1,
      id: 'stars-test',
      kind: 'star-tiles',
      title: 'Test stars',
      version,
      released: version,
      contentHash: version,
      bundled: false,
      optional: true,
      basePath: 'packs/stars-test/',
      files: entries,
      totalSize: entries.reduce((s, e) => s + e.size, 0),
      license: 'CC0',
      attribution: 'test',
      sourceUrl: 'https://example.invalid',
    },
  };
}

function serve(
  files: Record<string, ArrayBuffer>,
  base = 'https://src.test/data/packs/stars-test/',
) {
  setFetcherForTests(async (url) => {
    const path = url.replace(base, '');
    const data = files[path];
    return data ? new Response(data) : new Response('nf', { status: 404 });
  });
}

describe('data pack install / update', () => {
  beforeEach(async () => {
    const db = new AstroDataDb(`test-${Math.random()}`);
    setDataDbForTests(db);
    setDataBaseUrl('https://app.test/data/');
  });

  it('installs a verified pack and reads its files', async () => {
    const { manifest, files } = await makePack('2026.01.01', 3);
    serve(files);
    await installPack(manifest, 'https://src.test/data/');
    const state = await dataDb().packState.get('stars-test');
    expect(state?.activeVersion).toBe('2026.01.01');
    const buf = await readPackFile('stars-test', 'tiles/0001.bin');
    expect(buf!.byteLength).toBe(files['tiles/0001.bin'].byteLength);
  });

  it('a failed update (checksum mismatch) never replaces the working version', async () => {
    const v1 = await makePack('2026.01.01', 3);
    serve(v1.files);
    await installPack(v1.manifest, 'https://src.test/data/');

    const v2 = await makePack('2026.02.01', 5);
    // Corrupt the served file so its SHA-256 no longer matches the manifest.
    const corrupted = {
      ...v2.files,
      'tiles/0001.bin': encodeStars([
        { raDeg: 1, decDeg: 1, mag: 1, bv: 0 },
        { raDeg: 1, decDeg: 1, mag: 1, bv: 0 },
        { raDeg: 1, decDeg: 1, mag: 1, bv: 0 },
        { raDeg: 1, decDeg: 1, mag: 1, bv: 0 },
        { raDeg: 1, decDeg: 1, mag: 2, bv: 0 },
      ]),
    };
    serve(corrupted);
    await expect(installPack(v2.manifest, 'https://src.test/data/')).rejects.toThrow(/checksum/);

    const state = await dataDb().packState.get('stars-test');
    expect(state?.activeVersion).toBe('2026.01.01');
    const buf = await readPackFile('stars-test', 'tiles/0001.bin');
    expect(buf!.byteLength).toBe(v1.files['tiles/0001.bin'].byteLength);
    // No leftovers of the failed version.
    const leftovers = await dataDb()
      .packFiles.where('[packId+version]')
      .equals(['stars-test', '2026.02.01'])
      .count();
    expect(leftovers).toBe(0);
  });

  it('a failed update (network error midway) keeps the working version', async () => {
    const v1 = await makePack('2026.01.01', 3);
    serve(v1.files);
    await installPack(v1.manifest, 'https://src.test/data/');
    const v2 = await makePack('2026.03.01', 4);
    serve({ 'tiles/0001.bin': v2.files['tiles/0001.bin'] }); // tiles.json missing → 404
    await expect(installPack(v2.manifest, 'https://src.test/data/')).rejects.toThrow(/404/);
    expect((await dataDb().packState.get('stars-test'))?.activeVersion).toBe('2026.01.01');
  });

  it('a structurally invalid pack is rejected even with matching checksums', async () => {
    const v = await makePack('2026.04.01', 2);
    const bad = enc('not a star file');
    v.files['tiles/0001.bin'] = bad;
    v.manifest.files = await Promise.all(
      Object.entries(v.files).map(async ([path, data]) => ({
        path,
        size: data.byteLength,
        sha256: await sha256Hex(data),
      })),
    );
    serve(v.files);
    await expect(installPack(v.manifest, 'https://src.test/data/')).rejects.toThrow();
    expect(await dataDb().packState.get('stars-test')).toBeUndefined();
  });

  it('a successful update activates atomically and removes the old version', async () => {
    const v1 = await makePack('2026.01.01', 3);
    serve(v1.files);
    await installPack(v1.manifest, 'https://src.test/data/');
    const v2 = await makePack('2026.05.01', 7);
    serve(v2.files);
    await installPack(v2.manifest, 'https://src.test/data/');
    expect((await dataDb().packState.get('stars-test'))?.activeVersion).toBe('2026.05.01');
    expect(
      await dataDb()
        .packFiles.where('[packId+version]')
        .equals(['stars-test', '2026.01.01'])
        .count(),
    ).toBe(0);
  });

  it('removes packs', async () => {
    const v1 = await makePack('2026.01.01', 3);
    serve(v1.files);
    await installPack(v1.manifest, 'https://src.test/data/');
    await removePack('stars-test');
    expect(await readPackFile('stars-test', 'tiles/0001.bin')).toBeNull();
  });

  it('computes statuses and update availability', async () => {
    const v1 = await makePack('2026.01.01', 3);
    const v2 = await makePack('2026.06.01', 3);
    const remote: PackRegistry = { schema: 1, generated: '', packs: [v2.manifest] };
    serve(v1.files);
    await installPack(v1.manifest, 'https://src.test/data/');
    const states = await dataDb().packState.toArray();
    const [s] = computePackStatuses({ schema: 1, generated: '', packs: [] }, states, remote);
    expect(s.activeVersion).toBe('2026.01.01');
    expect(s.latestVersion).toBe('2026.06.01');
    expect(s.updateAvailable).toBe(true);
  });
});
