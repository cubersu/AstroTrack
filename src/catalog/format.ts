/**
 * Binary columnar formats for large immutable datasets.
 *
 * DSO index ("ATDSO001"):
 *   header 16 bytes: magic[8] | uint32 count | uint32 reserved
 *   Float32[count] × 8: ra, dec, major, minor, pa, magV, magB, sb   (NaN = missing)
 *   Uint8[count] × 3:   type, flags, constellation
 *
 * Star tile ("ATSTAR01"):
 *   header 16 bytes: magic[8] | uint32 count | uint32 reserved
 *   Float32[count] × 2: ra, dec (J2000, epoch of the source catalogue)
 *   Int16[count] × 2:   mag×100, colour index (B−V)×1000 (−32768 = unknown)
 *
 * All multi-byte values are little-endian (typed arrays on every supported
 * platform are little-endian; the decoder verifies this).
 */
import type { DsoType } from '../astro/objectTypes';
import { DSO_TYPES } from '../astro/objectTypes';

export const DSO_MAGIC = 'ATDSO001';
export const STAR_MAGIC = 'ATSTAR01';
const HEADER = 16;

function writeMagic(view: DataView, magic: string) {
  for (let i = 0; i < 8; i++) view.setUint8(i, magic.charCodeAt(i));
}

function readMagic(view: DataView): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += String.fromCharCode(view.getUint8(i));
  return s;
}

function assertLittleEndian() {
  const a = new Uint16Array([1]);
  if (new Uint8Array(a.buffer)[0] !== 1) throw new Error('Big-endian platforms are not supported');
}

export interface DsoColumns {
  count: number;
  ra: Float32Array;
  dec: Float32Array;
  major: Float32Array;
  minor: Float32Array;
  pa: Float32Array;
  magV: Float32Array;
  magB: Float32Array;
  sb: Float32Array;
  type: Uint8Array;
  flags: Uint8Array;
  constellation: Uint8Array;
}

export interface DsoRowInput {
  raDeg: number;
  decDeg: number;
  majorArcmin: number | null;
  minorArcmin: number | null;
  positionAngleDeg: number | null;
  magV: number | null;
  magB: number | null;
  sb: number | null;
  type: DsoType;
  flags: number;
  constellation: number;
}

const nz = (v: number | null) => (v == null || !Number.isFinite(v) ? Number.NaN : v);

export function encodeDsoIndex(rows: DsoRowInput[]): ArrayBuffer {
  assertLittleEndian();
  const n = rows.length;
  const size = HEADER + n * 4 * 8 + n * 3;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  writeMagic(view, DSO_MAGIC);
  view.setUint32(8, n, true);
  const cols = decodeColumnsUnsafe(buf, n);
  rows.forEach((r, i) => {
    cols.ra[i] = r.raDeg;
    cols.dec[i] = r.decDeg;
    cols.major[i] = nz(r.majorArcmin);
    cols.minor[i] = nz(r.minorArcmin);
    cols.pa[i] = nz(r.positionAngleDeg);
    cols.magV[i] = nz(r.magV);
    cols.magB[i] = nz(r.magB);
    cols.sb[i] = nz(r.sb);
    const t = DSO_TYPES.indexOf(r.type);
    if (t < 0) throw new Error(`Unknown type ${r.type}`);
    cols.type[i] = t;
    cols.flags[i] = r.flags;
    cols.constellation[i] = r.constellation;
  });
  return buf;
}

function decodeColumnsUnsafe(buf: ArrayBuffer, n: number): DsoColumns {
  let off = HEADER;
  const f = () => {
    const a = new Float32Array(buf, off, n);
    off += n * 4;
    return a;
  };
  const u = () => {
    const a = new Uint8Array(buf, off, n);
    off += n;
    return a;
  };
  const ra = f();
  const dec = f();
  const major = f();
  const minor = f();
  const pa = f();
  const magV = f();
  const magB = f();
  const sb = f();
  return {
    count: n,
    ra,
    dec,
    major,
    minor,
    pa,
    magV,
    magB,
    sb,
    type: u(),
    flags: u(),
    constellation: u(),
  };
}

export function decodeDsoIndex(buf: ArrayBuffer): DsoColumns {
  assertLittleEndian();
  if (buf.byteLength < HEADER) throw new Error('DSO index too small');
  const view = new DataView(buf);
  if (readMagic(view) !== DSO_MAGIC) throw new Error('Not a DSO index (bad magic)');
  const n = view.getUint32(8, true);
  const expected = HEADER + n * 4 * 8 + n * 3;
  if (buf.byteLength !== expected)
    throw new Error(`DSO index size mismatch: ${buf.byteLength} ≠ ${expected}`);
  return decodeColumnsUnsafe(buf, n);
}

export function typeAt(cols: DsoColumns, i: number): DsoType {
  return DSO_TYPES[cols.type[i]] ?? 'other';
}

export const fin = (v: number): number | null => (Number.isNaN(v) ? null : v);

/* ------------------------------- stars ------------------------------- */

export interface StarColumns {
  count: number;
  ra: Float32Array;
  dec: Float32Array;
  /** magnitude × 100 */
  mag: Int16Array;
  /** B−V × 1000, −32768 unknown */
  bv: Int16Array;
}

export interface StarRowInput {
  raDeg: number;
  decDeg: number;
  mag: number;
  bv: number | null;
}

export const BV_UNKNOWN = -32768;

export function encodeStars(rows: StarRowInput[]): ArrayBuffer {
  assertLittleEndian();
  const n = rows.length;
  const size = HEADER + n * 8 + n * 4;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  writeMagic(view, STAR_MAGIC);
  view.setUint32(8, n, true);
  const c = decodeStarsUnsafe(buf, n);
  rows.forEach((r, i) => {
    c.ra[i] = r.raDeg;
    c.dec[i] = r.decDeg;
    c.mag[i] = Math.round(Math.max(-327, Math.min(327, r.mag)) * 100);
    c.bv[i] =
      r.bv == null || !Number.isFinite(r.bv)
        ? BV_UNKNOWN
        : Math.round(Math.max(-5, Math.min(5, r.bv)) * 1000);
  });
  return buf;
}

function decodeStarsUnsafe(buf: ArrayBuffer, n: number): StarColumns {
  let off = HEADER;
  const ra = new Float32Array(buf, off, n);
  off += n * 4;
  const dec = new Float32Array(buf, off, n);
  off += n * 4;
  const mag = new Int16Array(buf, off, n);
  off += n * 2;
  const bv = new Int16Array(buf, off, n);
  return { count: n, ra, dec, mag, bv };
}

export function decodeStars(buf: ArrayBuffer): StarColumns {
  assertLittleEndian();
  if (buf.byteLength < HEADER) throw new Error('Star file too small');
  const view = new DataView(buf);
  if (readMagic(view) !== STAR_MAGIC) throw new Error('Not a star file (bad magic)');
  const n = view.getUint32(8, true);
  const expected = HEADER + n * 12;
  if (buf.byteLength !== expected)
    throw new Error(`Star file size mismatch: ${buf.byteLength} ≠ ${expected}`);
  return decodeStarsUnsafe(buf, n);
}
