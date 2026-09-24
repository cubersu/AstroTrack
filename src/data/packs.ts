/**
 * Data-pack manager: resolves pack files (installed version in IndexedDB,
 * otherwise the bundled copy shipped with the app), installs optional packs,
 * and applies updates atomically.
 *
 * Update safety (Section 41): a new version is downloaded into IndexedDB
 * under its own version key, every file is verified (size + SHA-256) and the
 * content is validated by a kind-specific validator. Only then is the active
 * pointer switched in a single transaction, after which older versions are
 * deleted. Any failure deletes the partially downloaded version and leaves
 * the working dataset untouched.
 */
import { dataDb, fileKey } from './dataDb';
import type { PackStateRecord } from './dataDb';
import { IntegrityError, sha256Hex } from './integrity';
import type { PackManifest, PackRegistry } from './packTypes';
import { decodeDsoIndex, decodeStars } from '../catalog/format';
import { decodeLpGrid } from './lightPollutionFormat';

let dataBase: string | null = null;

/** Absolute base URL of the bundled data directory (…/data/). */
export function setDataBaseUrl(url: string) {
  dataBase = url.endsWith('/') ? url : url + '/';
}

export function getDataBaseUrl(): string {
  if (dataBase) return dataBase;
  if (typeof document !== 'undefined') return new URL('data/', document.baseURI).href;
  throw new Error('Data base URL not configured');
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
let fetcher: Fetcher = (url, init) => fetch(url, init);
export function setFetcherForTests(f: Fetcher | null) {
  fetcher = f ?? ((url, init) => fetch(url, init));
}

/** Registry of packs bundled with this build of the app (precached). */
export async function loadBundledRegistry(): Promise<PackRegistry> {
  const res = await fetcher(getDataBaseUrl() + 'packs.json');
  if (!res.ok) throw new Error(`packs.json: HTTP ${res.status}`);
  return (await res.json()) as PackRegistry;
}

/** Registry at an update source (bypasses HTTP and service-worker caches). */
export async function loadRemoteRegistry(sourceBaseUrl: string): Promise<PackRegistry> {
  const base = sourceBaseUrl.endsWith('/') ? sourceBaseUrl : sourceBaseUrl + '/';
  const res = await fetcher(base + 'packs.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`packs.json: HTTP ${res.status}`);
  const reg = (await res.json()) as PackRegistry;
  if (reg.schema !== 1 || !Array.isArray(reg.packs)) throw new Error('Unsupported registry format');
  return reg;
}

export async function getPackState(packId: string): Promise<PackStateRecord | undefined> {
  return dataDb().packState.get(packId);
}

export async function listPackStates(): Promise<PackStateRecord[]> {
  return dataDb().packState.toArray();
}

/**
 * Read a file of a pack: from the active installed version if one exists,
 * otherwise from the bundled copy (if the pack is bundled).
 */
export async function readPackFile(
  packId: string,
  path: string,
  bundled?: PackManifest,
): Promise<ArrayBuffer | null> {
  const state = await dataDb().packState.get(packId);
  if (state) {
    const rec = await dataDb().packFiles.get(fileKey(packId, state.activeVersion, path));
    if (rec) return rec.data;
  }
  if (bundled?.bundled) {
    const res = await fetcher(getDataBaseUrl() + bundled.basePath + path);
    if (!res.ok) throw new Error(`${bundled.basePath}${path}: HTTP ${res.status}`);
    return res.arrayBuffer();
  }
  return null;
}

export async function readPackJson<T>(
  packId: string,
  path: string,
  bundled?: PackManifest,
): Promise<T | null> {
  const buf = await readPackFile(packId, path, bundled);
  if (!buf) return null;
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}

/** Kind-specific content validation run before activation. */
export async function validatePackContent(
  manifest: PackManifest,
  files: Map<string, ArrayBuffer>,
): Promise<void> {
  const need = (p: string) => {
    const b = files.get(p);
    if (!b) throw new IntegrityError(`missing ${p}`, p);
    return b;
  };
  switch (manifest.kind) {
    case 'dso-catalogue': {
      const cols = decodeDsoIndex(need('index.bin'));
      const names = JSON.parse(new TextDecoder().decode(need('names.json'))) as unknown[];
      if (!Array.isArray(names) || names.length !== cols.count)
        throw new IntegrityError('names/index count mismatch', 'names.json');
      if (manifest.records != null && manifest.records !== cols.count)
        throw new IntegrityError('record count mismatch', 'index.bin');
      break;
    }
    case 'star-catalogue':
      decodeStars(need('stars.bin'));
      break;
    case 'star-tiles':
      for (const [p, b] of files) if (p.endsWith('.bin')) decodeStars(b);
      break;
    case 'light-pollution':
      decodeLpGrid(need('grid.bin'));
      break;
    case 'comets':
      break;
  }
}

export interface InstallProgress {
  loadedBytes: number;
  totalBytes: number;
  file: string;
}

/**
 * Download, verify and atomically activate a pack version from `sourceBaseUrl`.
 * On any error the new version's files are deleted and the previous active
 * version (if any) remains active.
 */
export async function installPack(
  manifest: PackManifest,
  sourceBaseUrl: string,
  onProgress?: (p: InstallProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  const db = dataDb();
  const base =
    (sourceBaseUrl.endsWith('/') ? sourceBaseUrl : sourceBaseUrl + '/') + manifest.basePath;
  const version = manifest.version;
  const current = await db.packState.get(manifest.id);
  if (current?.activeVersion === version) return;
  const files = new Map<string, ArrayBuffer>();
  let loaded = 0;
  try {
    for (const f of manifest.files) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const res = await fetcher(base + f.path, { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (buf.byteLength !== f.size)
        throw new IntegrityError(`size mismatch for ${f.path}`, f.path);
      const hash = await sha256Hex(buf);
      if (hash !== f.sha256) throw new IntegrityError(`checksum mismatch for ${f.path}`, f.path);
      files.set(f.path, buf);
      await db.packFiles.put({
        key: fileKey(manifest.id, version, f.path),
        packId: manifest.id,
        version,
        path: f.path,
        data: buf,
      });
      loaded += f.size;
      onProgress?.({ loadedBytes: loaded, totalBytes: manifest.totalSize, file: f.path });
    }
    await validatePackContent(manifest, files);
    // Atomic activation: the pointer switch is a single transaction.
    await db.transaction('rw', db.packState, async () => {
      await db.packState.put({
        id: manifest.id,
        activeVersion: version,
        manifest,
        installedAt: Date.now(),
        source: 'download',
      });
    });
  } catch (err) {
    await db.packFiles.where('[packId+version]').equals([manifest.id, version]).delete();
    throw err;
  }
  // Clean up versions that are no longer active.
  await db.packFiles
    .where('packId')
    .equals(manifest.id)
    .filter((r) => r.version !== version)
    .delete();
}

/** Remove an installed pack (optional packs disappear; bundled packs revert to the bundled copy). */
export async function removePack(packId: string): Promise<void> {
  const db = dataDb();
  await db.transaction('rw', db.packState, db.packFiles, async () => {
    await db.packState.delete(packId);
    await db.packFiles.where('packId').equals(packId).delete();
  });
}

/** Compare installed/bundled versions with a remote registry. */
export interface PackStatus {
  id: string;
  title: string;
  kind: PackManifest['kind'];
  optional: boolean;
  bundled: boolean;
  bundledVersion: string | null;
  installedVersion: string | null;
  activeVersion: string | null;
  activeSource: 'bundled' | 'installed' | 'none';
  latestVersion: string | null;
  updateAvailable: boolean;
  installedAt: number | null;
  sizeBytes: number;
  license: string;
  attribution: string;
  records?: number;
}

export function computePackStatuses(
  bundled: PackRegistry | null,
  states: PackStateRecord[],
  remote: PackRegistry | null,
): PackStatus[] {
  const ids = new Set<string>([
    ...(bundled?.packs.map((p) => p.id) ?? []),
    ...states.map((s) => s.id),
    ...(remote?.packs.map((p) => p.id) ?? []),
  ]);
  const out: PackStatus[] = [];
  for (const id of ids) {
    const b = bundled?.packs.find((p) => p.id === id) ?? null;
    const s = states.find((x) => x.id === id) ?? null;
    const r = remote?.packs.find((p) => p.id === id) ?? null;
    const m = s?.manifest ?? b ?? r!;
    const active = s ? s.activeVersion : b?.bundled ? b.version : null;
    out.push({
      id,
      title: m.title,
      kind: m.kind,
      optional: m.optional,
      bundled: !!b?.bundled,
      bundledVersion: b?.bundled ? b.version : null,
      installedVersion: s?.activeVersion ?? null,
      activeVersion: active,
      activeSource: s ? 'installed' : b?.bundled ? 'bundled' : 'none',
      latestVersion: r?.version ?? null,
      updateAvailable:
        !!r &&
        active !== null &&
        r.version !== active &&
        r.released >= (s?.manifest.released ?? b?.released ?? ''),
      installedAt: s?.installedAt ?? null,
      sizeBytes: (s?.manifest ?? b ?? r)?.totalSize ?? 0,
      license: m.license,
      attribution: m.attribution,
      records: m.records,
    });
  }
  return out;
}
