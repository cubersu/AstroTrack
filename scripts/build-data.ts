/**
 * Build application-native astronomical datasets from the raw sources in
 * data-src/raw/ (run `npm run data:fetch` first).
 *
 * Outputs (committed, served statically):
 *   public/data/core/dso/            bundled DSO catalogue (precached)
 *   public/data/core/stars/          bundled bright-star catalogue (precached)
 *   public/data/packs/stars-hyg-deep optional deep star tiles (download on demand)
 *   public/data/packs.json           pack registry with sizes and SHA-256 checksums
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { radecToPix } from '../src/astro/healpix';
import { DSO_TYPES } from '../src/astro/objectTypes';
import { encodeDsoIndex, encodeStars } from '../src/catalog/format';
import type { CatalogueManifest, NameRow } from '../src/catalog/types';
import { DSO_FLAG } from '../src/catalog/types';
import type { PackRegistry, PackManifest } from '../src/data/packTypes';
import { normalizeOpenNgc } from './catalog/openngc';
import { parseRecords } from './lib/csv';
import { fileEntry, repoPath, sha256, writeFile } from './lib/io';
import { SOURCES } from './sources';
import { bayerLabel, parseHygRows } from './stars/hyg';

const RAW = repoPath('data-src', 'raw');
const OUT = repoPath('public', 'data');
const DETAIL_CHUNK = 500;
export const CORE_STAR_MAG_LIMIT = 8.0;
export const DEEP_TILE_ORDER = 2; // nside 4 → 192 tiles

function readRaw(...p: string[]): string {
  const path = join(RAW, ...p);
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Run "npm run data:fetch" first.`);
    process.exit(1);
  }
  return readFileSync(path, 'utf8');
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out.sort();
}

function previousRegistry(): PackRegistry | null {
  const p = join(OUT, 'packs.json');
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as PackRegistry) : null;
}

function finishPack(
  dir: string,
  base: Omit<PackManifest, 'files' | 'totalSize' | 'version' | 'released' | 'contentHash'>,
  prev: PackRegistry | null,
  today: string,
): PackManifest {
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) rmSync(manifestPath);
  const files = listFiles(dir).map((f) => fileEntry(dir, f));
  const contentHash = sha256(files.map((f) => `${f.path}:${f.sha256}`).join('\n')).slice(0, 12);
  const old = prev?.packs.find((p) => p.id === base.id);
  const released = old && old.contentHash === contentHash ? old.released : today;
  const manifest: PackManifest = {
    ...base,
    version: `${released.replaceAll('-', '.')}-${contentHash.slice(0, 8)}`,
    released,
    contentHash,
    files,
    totalSize: files.reduce((s, f) => s + f.size, 0),
  };
  writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

const today = new Date().toISOString().slice(0, 10);
const prev = previousRegistry();

/* ------------------------------ DSO catalogue ------------------------------ */
const ngcText = readRaw('openngc', 'NGC.csv');
const addText = readRaw('openngc', 'addendum.csv');
const { records, stats } = normalizeOpenNgc(parseRecords(ngcText, ';'), parseRecords(addText, ';'));
console.log(
  `OpenNGC: ${stats.input} rows → ${stats.output} objects (${stats.duplicatesMerged} duplicates merged)`,
);
if (stats.skippedNoCoordinates.length)
  console.log(`  skipped (no coordinates): ${stats.skippedNoCoordinates.join(', ')}`);
if (stats.unresolvedDuplicates.length)
  console.log(`  unresolved duplicates: ${stats.unresolvedDuplicates.join(', ')}`);

const dsoDir = join(OUT, 'core', 'dso');
rmSync(dsoDir, { recursive: true, force: true });
writeFile(
  join(dsoDir, 'index.bin'),
  encodeDsoIndex(
    records.map((r) => ({
      raDeg: r.raDeg,
      decDeg: r.decDeg,
      majorArcmin: r.majorArcmin,
      minorArcmin: r.minorArcmin,
      positionAngleDeg: r.positionAngleDeg,
      magV: r.magV,
      magB: r.magB,
      sb: r.sb,
      type: r.type,
      flags: r.flags | (r.sbBand === 'V' ? DSO_FLAG.SB_BAND_V : 0),
      constellation: r.constellation,
    })),
  ),
);
const names: NameRow[] = records.map((r) => [r.id, r.name, r.aliases, r.commonNames]);
writeFile(join(dsoDir, 'names.json'), JSON.stringify(names));
const chunks = Math.ceil(records.length / DETAIL_CHUNK);
for (let c = 0; c < chunks; c++) {
  const slice = records.slice(c * DETAIL_CHUNK, (c + 1) * DETAIL_CHUNK).map((r) => r.detail);
  writeFile(join(dsoDir, 'details', `${String(c).padStart(3, '0')}.json`), JSON.stringify(slice));
}
const typeCounts: Record<string, number> = {};
for (const t of DSO_TYPES) typeCounts[t] = 0;
for (const r of records) typeCounts[r.type]++;
const ngcHash = sha256(ngcText);
const addHash = sha256(addText);
const catalogueMeta: CatalogueManifest = {
  schema: 1,
  packId: 'dso-core',
  version: '',
  count: records.length,
  detailChunkSize: DETAIL_CHUNK,
  detailChunks: chunks,
  generated: today,
  sources: [
    {
      name: 'OpenNGC NGC.csv',
      url: SOURCES.openngc.files.ngc,
      license: SOURCES.openngc.license,
      sha256: ngcHash,
    },
    {
      name: 'OpenNGC addendum.csv',
      url: SOURCES.openngc.files.addendum,
      license: SOURCES.openngc.license,
      sha256: addHash,
    },
  ],
  typeCounts,
};
writeFile(join(dsoDir, 'catalogue.json'), JSON.stringify(catalogueMeta, null, 2) + '\n');
const dsoPack = finishPack(
  dsoDir,
  {
    schema: 1,
    id: 'dso-core',
    kind: 'dso-catalogue',
    title: 'Deep-sky catalogue (OpenNGC)',
    bundled: true,
    optional: false,
    basePath: 'core/dso/',
    records: records.length,
    license: 'CC-BY-SA-4.0',
    attribution: SOURCES.openngc.attribution,
    sourceUrl: SOURCES.openngc.homepage,
    sourceChecksums: { 'NGC.csv': ngcHash, 'addendum.csv': addHash },
  },
  prev,
  today,
);

/* ---------------------------------- stars ---------------------------------- */
const hygText = readRaw('hyg', 'hygdata_v41.csv');
const hygHash = sha256(hygText);
const stars = parseHygRows(parseRecords(hygText, ','));
stars.sort((a, b) => a.mag - b.mag);
const core = stars.filter((s) => s.mag <= CORE_STAR_MAG_LIMIT);
const deep = stars.filter((s) => s.mag > CORE_STAR_MAG_LIMIT);
console.log(
  `HYG: ${stars.length} stars → core ${core.length} (≤ ${CORE_STAR_MAG_LIMIT} mag), deep ${deep.length}`,
);

const starDir = join(OUT, 'core', 'stars');
rmSync(starDir, { recursive: true, force: true });
writeFile(join(starDir, 'stars.bin'), encodeStars(core));
const starNames: Array<[number, string | null, string | null, string | null, number | null]> = [];
core.forEach((s, i) => {
  const b = bayerLabel(s.bayer, s.con);
  const f = s.flam && s.con ? `${s.flam} ${s.con}` : null;
  if (s.proper || b || (f && s.mag <= 6)) starNames.push([i, s.proper, b, f, s.hip]);
});
writeFile(join(starDir, 'names.json'), JSON.stringify(starNames));
const starPack = finishPack(
  starDir,
  {
    schema: 1,
    id: 'stars-core',
    kind: 'star-catalogue',
    title: `Bright stars (HYG v4.1, ≤ ${CORE_STAR_MAG_LIMIT} mag)`,
    bundled: true,
    optional: false,
    basePath: 'core/stars/',
    records: core.length,
    license: 'CC-BY-SA-4.0',
    attribution: SOURCES.hyg.attribution,
    sourceUrl: SOURCES.hyg.homepage,
    sourceChecksums: { 'hygdata_v41.csv': hygHash },
    magLimit: CORE_STAR_MAG_LIMIT,
  },
  prev,
  today,
);

const deepDir = join(OUT, 'packs', 'stars-hyg-deep');
rmSync(deepDir, { recursive: true, force: true });
const nside = 1 << DEEP_TILE_ORDER;
const tiles = new Map<number, typeof deep>();
for (const s of deep) {
  const p = radecToPix(nside, s.raDeg, s.decDeg);
  if (!tiles.has(p)) tiles.set(p, []);
  tiles.get(p)!.push(s);
}
const tileCounts: Record<string, number> = {};
for (const [p, list] of [...tiles.entries()].sort((a, b) => a[0] - b[0])) {
  writeFile(join(deepDir, 'tiles', `${String(p).padStart(4, '0')}.bin`), encodeStars(list));
  tileCounts[p] = list.length;
}
writeFile(
  join(deepDir, 'tiles.json'),
  JSON.stringify(
    {
      order: DEEP_TILE_ORDER,
      nside,
      scheme: 'nested',
      counts: tileCounts,
      magMin: CORE_STAR_MAG_LIMIT,
    },
    null,
    2,
  ) + '\n',
);
const deepPack = finishPack(
  deepDir,
  {
    schema: 1,
    id: 'stars-hyg-deep',
    kind: 'star-tiles',
    title: 'Additional stars (HYG v4.1, fainter than 8 mag)',
    bundled: false,
    optional: true,
    basePath: 'packs/stars-hyg-deep/',
    records: deep.length,
    license: 'CC-BY-SA-4.0',
    attribution: SOURCES.hyg.attribution,
    sourceUrl: SOURCES.hyg.homepage,
    sourceChecksums: { 'hygdata_v41.csv': hygHash },
    tiling: { scheme: 'healpix-nested', order: DEEP_TILE_ORDER },
  },
  prev,
  today,
);

/* -------------------------------- registry -------------------------------- */
const registry: PackRegistry = {
  schema: 1,
  generated: today,
  packs: [dsoPack, starPack, deepPack].map((p) => ({ ...p, files: p.files })),
};
writeFile(join(OUT, 'packs.json'), JSON.stringify(registry, null, 2) + '\n');
for (const p of registry.packs)
  console.log(
    `pack ${p.id} ${p.version}: ${p.files.length} files, ${(p.totalSize / 1024).toFixed(0)} KiB`,
  );
