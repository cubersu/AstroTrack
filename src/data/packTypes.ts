/** Data-pack registry and manifest formats (shared by the build pipeline and the app). */

export type PackKind =
  'dso-catalogue' | 'star-catalogue' | 'star-tiles' | 'light-pollution' | 'comets';

export interface PackFile {
  path: string;
  size: number;
  sha256: string;
}

export interface PackManifest {
  schema: 1;
  id: string;
  kind: PackKind;
  title: string;
  /** Semantic identity: release date + content hash prefix. Any difference = different content. */
  version: string;
  released: string;
  contentHash: string;
  /** Bundled packs ship with the app (precached); others are downloaded on demand. */
  bundled: boolean;
  optional: boolean;
  /** Path of the pack directory relative to the data root (e.g. "core/dso/"). */
  basePath: string;
  files: PackFile[];
  totalSize: number;
  records?: number;
  license: string;
  attribution: string;
  sourceUrl: string;
  sourceChecksums?: Record<string, string>;
  magLimit?: number;
  tiling?: { scheme: 'healpix-nested'; order: number };
  /** Light-pollution packs: region bounds and grid description. */
  region?: { name: string; west: number; south: number; east: number; north: number };
}

export interface PackRegistry {
  schema: 1;
  generated: string;
  packs: PackManifest[];
}
