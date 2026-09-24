/**
 * IndexedDB store for relatively immutable astronomical data and caches.
 * Deliberately separate from the user database (src/db/userDb.ts): user data
 * is backed up/exported, astronomical data is re-downloadable.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { PackManifest } from './packTypes';

export interface PackFileRecord {
  /** `${packId}@${version}/${path}` */
  key: string;
  packId: string;
  version: string;
  path: string;
  data: ArrayBuffer;
}

export interface PackStateRecord {
  id: string;
  activeVersion: string;
  manifest: PackManifest;
  installedAt: number;
  source: 'download' | 'import';
}

export interface WeatherCacheRecord {
  key: string;
  latDeg: number;
  lonDeg: number;
  fetchedAt: number;
  /** Raw provider payload (normalised hourly arrays). */
  payload: unknown;
}

export interface PreviewCacheRecord {
  id: string;
  blob: Blob;
  mime: string;
  source: string;
  attribution: string;
  fovDeg: number;
  fetchedAt: number;
}

export interface CometDataRecord {
  id: 'comets';
  fetchedAt: number;
  source: string;
  /** Raw MPC one-line elements text (parsed on use). */
  text: string;
  count: number;
}

export class AstroDataDb extends Dexie {
  packFiles!: EntityTable<PackFileRecord, 'key'>;
  packState!: EntityTable<PackStateRecord, 'id'>;
  weatherCache!: EntityTable<WeatherCacheRecord, 'key'>;
  previewCache!: EntityTable<PreviewCacheRecord, 'id'>;
  cometData!: EntityTable<CometDataRecord, 'id'>;

  constructor(name = 'astrotrack-data') {
    super(name);
    this.version(1).stores({
      packFiles: 'key, [packId+version], packId',
      packState: 'id',
      weatherCache: 'key, fetchedAt',
      previewCache: 'id, fetchedAt',
      cometData: 'id',
    });
  }
}

let instance: AstroDataDb | null = null;
export function dataDb(): AstroDataDb {
  if (!instance) instance = new AstroDataDb();
  return instance;
}

/** Test hook: use a fresh database instance. */
export function setDataDbForTests(db: AstroDataDb | null) {
  instance = db;
}

export function fileKey(packId: string, version: string, path: string): string {
  return `${packId}@${version}/${path}`;
}
