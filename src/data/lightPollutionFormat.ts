/**
 * Light-pollution atlas grid format ("ATLP0001").
 *
 *   header 36 bytes: magic[8] | uint32 width | uint32 height |
 *                    float32 west | float32 south | float32 east | float32 north | uint32 reserved
 *   Uint8[width × height], row-major from north to south, west to east.
 *
 * Cell value 0 = no data; 1..255 encode the ESTIMATED zenith sky brightness
 *   SQM = 16 + (v − 1) / 254 × 6.5   (16.0 … 22.5 mag/arcsec²)
 * Values are estimates derived from satellite night-light data (see
 * docs/offline-data.md); they are never presented as measurements.
 */

export const LP_MAGIC = 'ATLP0001';
const HEADER = 36;
export const LP_SQM_MIN = 16;
export const LP_SQM_SPAN = 6.5;

export interface LpGrid {
  width: number;
  height: number;
  west: number;
  south: number;
  east: number;
  north: number;
  values: Uint8Array;
}

export function sqmToLpValue(sqm: number | null): number {
  if (sqm === null || !Number.isFinite(sqm)) return 0;
  const v = Math.round(1 + ((sqm - LP_SQM_MIN) / LP_SQM_SPAN) * 254);
  return Math.max(1, Math.min(255, v));
}

export function lpValueToSqm(v: number): number | null {
  if (v === 0) return null;
  return LP_SQM_MIN + ((v - 1) / 254) * LP_SQM_SPAN;
}

export function encodeLpGrid(g: LpGrid): ArrayBuffer {
  const buf = new ArrayBuffer(HEADER + g.width * g.height);
  const view = new DataView(buf);
  for (let i = 0; i < 8; i++) view.setUint8(i, LP_MAGIC.charCodeAt(i));
  view.setUint32(8, g.width, true);
  view.setUint32(12, g.height, true);
  view.setFloat32(16, g.west, true);
  view.setFloat32(20, g.south, true);
  view.setFloat32(24, g.east, true);
  view.setFloat32(28, g.north, true);
  new Uint8Array(buf, HEADER).set(g.values);
  return buf;
}

export function decodeLpGrid(buf: ArrayBuffer): LpGrid {
  const view = new DataView(buf);
  let magic = '';
  for (let i = 0; i < 8; i++) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== LP_MAGIC) throw new Error('Not a light-pollution grid');
  const width = view.getUint32(8, true);
  const height = view.getUint32(12, true);
  if (buf.byteLength !== HEADER + width * height) throw new Error('LP grid size mismatch');
  return {
    width,
    height,
    west: view.getFloat32(16, true),
    south: view.getFloat32(20, true),
    east: view.getFloat32(24, true),
    north: view.getFloat32(28, true),
    values: new Uint8Array(buf, HEADER, width * height),
  };
}

/**
 * Bilinear estimate at a point (cell centres), ignoring no-data cells.
 * Returns null outside the grid or when all neighbours lack data.
 */
export function sampleLpGrid(g: LpGrid, latDeg: number, lonDeg: number): number | null {
  if (latDeg < g.south || latDeg > g.north || lonDeg < g.west || lonDeg > g.east) return null;
  const cw = (g.east - g.west) / g.width;
  const ch = (g.north - g.south) / g.height;
  const fx = (lonDeg - g.west) / cw - 0.5;
  const fy = (g.north - latDeg) / ch - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  let wsum = 0;
  let acc = 0;
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const x = Math.min(Math.max(x0 + dx, 0), g.width - 1);
    const y = Math.min(Math.max(y0 + dy, 0), g.height - 1);
    const sqm = lpValueToSqm(g.values[y * g.width + x]);
    if (sqm === null) continue;
    const w = (1 - Math.abs(fx - (x0 + dx))) * (1 - Math.abs(fy - (y0 + dy)));
    if (w <= 0) continue;
    // Average in linear flux, not magnitudes.
    acc += w * Math.pow(10, -0.4 * sqm);
    wsum += w;
  }
  if (wsum === 0) return null;
  return -2.5 * Math.log10(acc / wsum);
}
