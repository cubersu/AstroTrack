import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CatalogStore, compareDesignations } from './catalogStore';
import type { NameRow } from './types';

const DIR = join(import.meta.dirname, '..', '..', 'public', 'data', 'core', 'dso');
let store: CatalogStore;

beforeAll(() => {
  const b = readFileSync(join(DIR, 'index.bin'));
  const names = JSON.parse(readFileSync(join(DIR, 'names.json'), 'utf8')) as NameRow[];
  store = CatalogStore.fromBuffers(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    names,
    'test',
  );
});

describe('bundled catalogue', () => {
  it('loads a large catalogue', () => {
    expect(store.count).toBeGreaterThan(13000);
  });
  it('resolves M31 / NGC 224 / Andromeda to the same object', () => {
    const a = store.search('M31', 5)[0];
    const b = store.search('NGC 224', 5)[0];
    const c = store.search('ngc0224', 5)[0];
    const d = store.search('andromeda gal', 5)[0];
    const e = store.search('Messier 31', 5)[0];
    for (const r of [b, c, d, e]) expect(r.id).toBe(a.id);
    expect(a.name).toBe('M 31');
    expect(a.commonName).toBe('Andromeda Galaxy');
    expect(a.type).toBe('galaxy');
  });
  it('ranks exact designation matches first', () => {
    expect(store.search('M1', 3)[0].name).toBe('M 1');
    expect(store.search('C 20', 3)[0].commonName).toBe('North America Nebula');
    expect(store.search('Sh2-155', 3)[0].commonName).toBe('Cave Nebula');
  });
  it('searches common names with Turkish-insensitive folding', () => {
    expect(store.search('ORİON', 5).some((r) => r.name === 'M 42')).toBe(true);
    expect(store.search('whirlpool', 3)[0].name).toBe('M 51');
  });
  it('filters by group, type and visibility', () => {
    const messier = store.filterIndices({ group: 'messier' });
    expect(messier.length).toBeGreaterThanOrEqual(105);
    const gc = store.filterIndices({ group: 'messier', types: ['globular-cluster'] });
    expect(gc.length).toBeGreaterThan(20);
    const south = store.filterIndices({ latitudeDeg: 41, minAltDeg: 20, group: 'caldwell' });
    const all = store.filterIndices({ group: 'caldwell' });
    expect(south.length).toBeLessThan(all.length);
  });
  it('sorts designations naturally', () => {
    const list = ['NGC 7', 'M 10', 'M 2', 'IC 1', 'C 3'];
    expect([...list].sort(compareDesignations)).toEqual(['M 2', 'M 10', 'C 3', 'NGC 7', 'IC 1']);
  });
  it('search over the full catalogue is fast', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) store.search('ngc 1', 50);
    for (let i = 0; i < 50; i++) store.search('nebula', 50);
    expect((performance.now() - t0) / 100).toBeLessThan(20);
  });
});
