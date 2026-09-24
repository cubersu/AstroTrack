/**
 * In-memory catalogue store used inside the catalogue Web Worker. Holds the
 * columnar index (typed arrays) and name table; never handed to React as a
 * whole. Provides indexed search, filtering and summaries.
 */
import type { DsoType } from '../astro/objectTypes';
import { DSO_TYPES, TYPE_PROFILES } from '../astro/objectTypes';
import { culminationAltitudeDeg } from '../astro/visibility';
import { constellationAbbr, constellationIndex } from './constellations';
import { extraKeys, searchKey, textKey } from './designations';
import type { DsoColumns } from './format';
import { decodeDsoIndex, fin, typeAt } from './format';
import type { DsoSummary, NameRow } from './types';
import { DSO_FLAG } from './types';

export type CatalogueGroup = 'all' | 'messier' | 'caldwell' | 'named';
export type CatalogueSort = 'name' | 'magnitude' | 'size' | 'ra' | 'relevance';

export interface CatalogueFilter {
  types?: DsoType[];
  group?: CatalogueGroup;
  constellation?: string | null;
  /** Maximum (faintest) V magnitude; objects without magnitude pass only if includeUnknownMag. */
  magMax?: number | null;
  includeUnknownMag?: boolean;
  sizeMinArcmin?: number | null;
  sizeMaxArcmin?: number | null;
  /** Only objects that culminate at least `minAltDeg` above the horizon at this latitude. */
  latitudeDeg?: number | null;
  minAltDeg?: number | null;
  /** Hide stars / nonexistent / other entries (default true). */
  dsoOnly?: boolean;
}

export class CatalogStore {
  readonly cols: DsoColumns;
  readonly names: NameRow[];
  private readonly idIndex = new Map<string, number>();
  /** Sorted designation keys for prefix search. */
  private readonly desigKeys: Array<[string, number]> = [];
  /** Folded common-name text per object ("" if none). */
  private readonly commonText: string[] = [];
  readonly version: string;

  constructor(cols: DsoColumns, names: NameRow[], version: string) {
    if (names.length !== cols.count) throw new Error('names/index count mismatch');
    this.cols = cols;
    this.names = names;
    this.version = version;
    names.forEach((row, i) => {
      this.idIndex.set(row[0], i);
      const add = (k: string) => {
        if (k) this.desigKeys.push([k, i]);
      };
      add(searchKey(row[1]));
      for (const a of row[2]) {
        add(searchKey(a));
        for (const k of extraKeys(a)) add(k);
      }
      for (const k of extraKeys(row[1])) add(k);
      this.commonText.push(row[3].map(textKey).join(' | '));
    });
    this.desigKeys.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  }

  static fromBuffers(indexBuf: ArrayBuffer, names: NameRow[], version: string): CatalogStore {
    return new CatalogStore(decodeDsoIndex(indexBuf), names, version);
  }

  get count(): number {
    return this.cols.count;
  }

  indexOf(id: string): number | undefined {
    return this.idIndex.get(id);
  }

  summary(i: number): DsoSummary {
    const c = this.cols;
    const sb = fin(c.sb[i]);
    const row = this.names[i];
    return {
      index: i,
      id: row[0],
      name: row[1],
      commonName: row[3][0] ?? null,
      type: typeAt(c, i),
      raDeg: c.ra[i],
      decDeg: c.dec[i],
      majorArcmin: fin(c.major[i]),
      minorArcmin: fin(c.minor[i]),
      positionAngleDeg: fin(c.pa[i]),
      magV: fin(c.magV[i]),
      magB: fin(c.magB[i]),
      sbCatalogue: sb,
      sbBand: sb === null ? null : c.flags[i] & DSO_FLAG.SB_BAND_V ? 'V' : 'B',
      constellation: constellationAbbr(c.constellation[i]),
      flags: c.flags[i],
    };
  }

  aliases(i: number): string[] {
    return this.names[i][2];
  }

  commonNames(i: number): string[] {
    return this.names[i][3];
  }

  /** Rough "notability" used only to order search results and ties. */
  notability(i: number): number {
    const f = this.cols.flags[i];
    let n = 0;
    if (f & DSO_FLAG.MESSIER) n += 4;
    if (f & DSO_FLAG.CALDWELL) n += 3;
    if (f & DSO_FLAG.COMMON_NAME) n += 2;
    const mag = this.cols.magV[i];
    if (!Number.isNaN(mag)) n += Math.max(0, (12 - mag) / 4);
    return n;
  }

  private lowerBound(prefix: string): number {
    let lo = 0;
    let hi = this.desigKeys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.desigKeys[mid][0] < prefix) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Name/designation search with ranking; returns object indices. */
  searchIndices(query: string, limit = 50, filter?: CatalogueFilter): number[] {
    const q = searchKey(query);
    const t = textKey(query);
    if (!q && !t) return [];
    const rank = new Map<number, number>();
    const consider = (i: number, r: number) => {
      const prev = rank.get(i);
      if (prev === undefined || r < prev) rank.set(i, r);
    };
    if (q) {
      for (let k = this.lowerBound(q); k < this.desigKeys.length; k++) {
        const [key, i] = this.desigKeys[k];
        if (!key.startsWith(q)) break;
        consider(i, key === q ? 0 : 1 + Math.min(key.length - q.length, 8) / 10);
        if (rank.size > 5000) break;
      }
    }
    if (t.length >= 2) {
      for (let i = 0; i < this.commonText.length; i++) {
        const ct = this.commonText[i];
        if (!ct) continue;
        const pos = ct.indexOf(t);
        if (pos < 0) continue;
        const wordStart = pos === 0 || ct[pos - 1] === ' ';
        consider(i, wordStart ? (pos === 0 ? 2 : 2.5) : 3);
      }
    }
    let out = [...rank.entries()];
    if (filter) out = out.filter(([i]) => this.matches(i, filter));
    out.sort((a, b) => a[1] - b[1] || this.notability(b[0]) - this.notability(a[0]) || a[0] - b[0]);
    return out.slice(0, limit).map(([i]) => i);
  }

  search(query: string, limit = 50, filter?: CatalogueFilter): DsoSummary[] {
    return this.searchIndices(query, limit, filter).map((i) => this.summary(i));
  }

  matches(i: number, f: CatalogueFilter): boolean {
    const c = this.cols;
    const type = DSO_TYPES[c.type[i]];
    if ((f.dsoOnly ?? true) && !TYPE_PROFILES[type].scored) return false;
    if (f.types && f.types.length > 0 && !f.types.includes(type)) return false;
    const flags = c.flags[i];
    switch (f.group ?? 'all') {
      case 'messier':
        if (!(flags & DSO_FLAG.MESSIER)) return false;
        break;
      case 'caldwell':
        if (!(flags & DSO_FLAG.CALDWELL)) return false;
        break;
      case 'named':
        if (!(flags & DSO_FLAG.COMMON_NAME)) return false;
        break;
    }
    if (f.constellation) {
      if (c.constellation[i] !== constellationIndex(f.constellation)) return false;
    }
    if (f.magMax != null) {
      let m = c.magV[i];
      if (Number.isNaN(m) && !Number.isNaN(c.magB[i])) m = c.magB[i] - 0.5;
      if (Number.isNaN(m)) {
        if (!f.includeUnknownMag) return false;
      } else if (m > f.magMax) return false;
    }
    const size = c.major[i];
    if (f.sizeMinArcmin != null && !(size >= f.sizeMinArcmin)) return false;
    if (f.sizeMaxArcmin != null && !(size <= f.sizeMaxArcmin)) return false;
    if (f.latitudeDeg != null) {
      if (culminationAltitudeDeg(c.dec[i], f.latitudeDeg) < (f.minAltDeg ?? 0)) return false;
    }
    return true;
  }

  filterIndices(f: CatalogueFilter, sort: CatalogueSort = 'name'): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.cols.count; i++) if (this.matches(i, f)) out.push(i);
    const c = this.cols;
    const num = (v: number, fallback: number) => (Number.isNaN(v) ? fallback : v);
    switch (sort) {
      case 'magnitude':
        out.sort((a, b) => num(c.magV[a], 99) - num(c.magV[b], 99));
        break;
      case 'size':
        out.sort((a, b) => num(c.major[b], -1) - num(c.major[a], -1));
        break;
      case 'ra':
        out.sort((a, b) => c.ra[a] - c.ra[b]);
        break;
      case 'relevance':
        out.sort((a, b) => this.notability(b) - this.notability(a) || a - b);
        break;
      default:
        out.sort((a, b) => compareDesignations(this.names[a][1], this.names[b][1]));
    }
    return out;
  }
}

/** Natural sort for designations: "M 2" < "M 10" < "NGC 7". */
export function compareDesignations(a: string, b: string): number {
  const pa = /^([A-Za-z]+)\s*(\d+)?(.*)$/.exec(a);
  const pb = /^([A-Za-z]+)\s*(\d+)?(.*)$/.exec(b);
  const order = (p: string) => ({ M: 0, C: 1, NGC: 2, IC: 3 })[p] ?? 4;
  if (pa && pb) {
    const oa = order(pa[1]);
    const ob = order(pb[1]);
    if (oa !== ob) return oa - ob;
    if (pa[1] !== pb[1]) return pa[1] < pb[1] ? -1 : 1;
    const na = Number(pa[2] ?? 0);
    const nb = Number(pb[2] ?? 0);
    if (na !== nb) return na - nb;
    return pa[3] < pb[3] ? -1 : pa[3] > pb[3] ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}
