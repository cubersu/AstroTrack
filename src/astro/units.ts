/**
 * Canonical units and conversions.
 *
 * Internal canonical units used throughout the astronomy engine:
 *  - angles: degrees (number), unless a variable name ends in `Rad`
 *  - right ascension: degrees (0..360) — NOT hours — unless suffixed `Hours`
 *  - angular sizes of objects: arcminutes (catalogue convention), suffixed `Arcmin`
 *  - pixel scale: arcseconds per pixel
 *  - time instants: JavaScript epoch milliseconds (UTC), suffixed `Ms`
 *  - durations: seconds (suffix `S`) or hours (suffix `H`) — always explicit
 *  - lengths: millimetres for optics/sensors, micrometres for pixel pitch
 *  - surface brightness: magnitudes per square arcsecond (mag/arcsec²)
 */

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const ARCSEC_PER_RAD = 206264.80624709636;
export const ARCMIN_PER_DEG = 60;
export const ARCSEC_PER_DEG = 3600;
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
/** Ratio of sidereal to solar (UT1) time rate. */
export const SIDEREAL_RATE = 1.00273790935;

export const degToRad = (deg: number): number => deg * DEG2RAD;
export const radToDeg = (rad: number): number => rad * RAD2DEG;
export const hoursToDeg = (hours: number): number => hours * 15;
export const degToHours = (deg: number): number => deg / 15;
export const arcminToDeg = (arcmin: number): number => arcmin / ARCMIN_PER_DEG;
export const degToArcmin = (deg: number): number => deg * ARCMIN_PER_DEG;
export const arcsecToDeg = (arcsec: number): number => arcsec / ARCSEC_PER_DEG;
export const degToArcsec = (deg: number): number => deg * ARCSEC_PER_DEG;

/** Normalise an angle in degrees to [0, 360). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalise an angle in degrees to [-180, 180). */
export function norm180(deg: number): number {
  const r = norm360(deg + 180) - 180;
  return r;
}

/** Normalise hours to [-12, 12). */
export function normHours12(h: number): number {
  let r = h % 24;
  if (r < -12) r += 24;
  if (r >= 12) r -= 24;
  return r;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Linear interpolation over a sorted breakpoint table [[x, y], ...]; clamps outside. */
export function interpolateTable(
  table: ReadonlyArray<readonly [number, number]>,
  x: number,
): number {
  if (table.length === 0) throw new Error('empty table');
  if (x <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + f * (y1 - y0);
    }
  }
  return last[1];
}

/** Parse sexagesimal "HH:MM:SS.ss" (hours) to degrees. */
export function parseRaHms(s: string): number {
  const parts = s
    .trim()
    .split(/[:\s]+/)
    .map(Number);
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Invalid RA: ${s}`);
  }
  const [h, m, sec = 0] = parts;
  return (h + m / 60 + sec / 3600) * 15;
}

/** Parse sexagesimal "+DD:MM:SS.s" to degrees. */
export function parseDecDms(s: string): number {
  const t = s.trim();
  const neg = t.startsWith('-');
  const parts = t
    .replace(/^[+-]/, '')
    .split(/[:\s]+/)
    .map(Number);
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) {
    throw new Error(`Invalid Dec: ${s}`);
  }
  const [d, m, sec = 0] = parts;
  const v = d + m / 60 + sec / 3600;
  return neg ? -v : v;
}

function pad(n: number, width: number, decimals = 0): string {
  const s = decimals > 0 ? n.toFixed(decimals) : String(Math.floor(n));
  const [int, frac] = s.split('.');
  return int.padStart(width, '0') + (frac !== undefined ? '.' + frac : '');
}

/** Format RA (degrees) as "HHh MMm SS.Ss". */
export function formatRa(raDeg: number, secDecimals = 1): string {
  let totalSec = (norm360(raDeg) / 15) * 3600;
  totalSec = Math.round(totalSec * 10 ** secDecimals) / 10 ** secDecimals;
  if (totalSec >= 86400) totalSec -= 86400;
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec - h * 3600) / 60);
  const s = totalSec - h * 3600 - m * 60;
  return `${pad(h, 2)}h ${pad(m, 2)}m ${pad(s, 2, secDecimals)}s`;
}

/** Format Dec (degrees) as "+DD° MM′ SS″". */
export function formatDec(decDeg: number, secDecimals = 0): string {
  const sign = decDeg < 0 ? '−' : '+';
  let totalSec = Math.abs(decDeg) * 3600;
  totalSec = Math.round(totalSec * 10 ** secDecimals) / 10 ** secDecimals;
  const d = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec - d * 3600) / 60);
  const s = totalSec - d * 3600 - m * 60;
  return `${sign}${pad(d, 2)}° ${pad(m, 2)}′ ${pad(s, 2, secDecimals)}″`;
}

/** Format an angle given in degrees with a sensible unit (°, ′ or ″). */
export function formatAngle(deg: number): string {
  const a = Math.abs(deg);
  if (a >= 1) return `${deg.toFixed(a >= 10 ? 1 : 2)}°`;
  if (a * 60 >= 1) return `${(deg * 60).toFixed(1)}′`;
  return `${(deg * 3600).toFixed(1)}″`;
}
