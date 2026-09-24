import type { DsoType } from '../astro/objectTypes';

/** Flags bitfield stored per object in the binary index. */
export const DSO_FLAG = {
  /** Catalogue surface brightness is in V (otherwise B). */
  SB_BAND_V: 1 << 0,
  MESSIER: 1 << 1,
  CALDWELL: 1 << 2,
  COMMON_NAME: 1 << 3,
  ADDENDUM: 1 << 4,
} as const;

/** Compact per-object summary (everything the scanner needs). */
export interface DsoSummary {
  index: number;
  /** Stable immutable ID, e.g. "ongc:NGC0224". Used by favourites, plans, journal. */
  id: string;
  /** Primary display designation, e.g. "M 31". */
  name: string;
  commonName: string | null;
  type: DsoType;
  raDeg: number;
  decDeg: number;
  majorArcmin: number | null;
  minorArcmin: number | null;
  positionAngleDeg: number | null;
  magV: number | null;
  magB: number | null;
  sbCatalogue: number | null;
  sbBand: 'B' | 'V' | null;
  constellation: string | null;
  flags: number;
}

export interface DsoDetail {
  aliases: string[];
  commonNames: string[];
  hubble?: string;
  redshift?: number;
  radialVelocityKms?: number;
  parallaxMas?: number;
  nedNotes?: string;
  ongcNotes?: string;
  /** OpenNGC per-field source codes. */
  sources?: string;
  catalogue: string;
}

/** Row of names.json: [id, primaryName, aliases, commonNames]. */
export type NameRow = [string, string, string[], string[]];

export interface CatalogueManifest {
  schema: 1;
  packId: string;
  version: string;
  count: number;
  detailChunkSize: number;
  detailChunks: number;
  generated: string;
  sources: Array<{
    name: string;
    url: string;
    license: string;
    sha256?: string;
    retrieved?: string;
  }>;
  typeCounts: Record<string, number>;
}
