import { DEG2RAD, RAD2DEG, norm360, clamp } from './units';

/** Geographic observer. Latitude/longitude in degrees (east positive), elevation in metres. */
export interface GeoLocation {
  latDeg: number;
  lonDeg: number;
  elevationM?: number;
}

/** Equatorial coordinates in degrees. */
export interface Equatorial {
  raDeg: number;
  decDeg: number;
}

/** Horizontal coordinates in degrees. Azimuth measured from North through East. */
export interface Horizontal {
  altDeg: number;
  azDeg: number;
}

/**
 * Convert an equatorial position (of date) to horizontal coordinates for a
 * given local sidereal time. Geometric altitude — no atmospheric refraction.
 *
 * sin h = sin φ sin δ + cos φ cos δ cos H
 * A_S  = atan2(cos δ sin H, cos δ cos H sin φ − sin δ cos φ)  (from South, westward)
 * A_N  = A_S + 180°
 */
export function equatorialToHorizontal(
  raDeg: number,
  decDeg: number,
  latDeg: number,
  lstDeg: number,
): Horizontal {
  const H = (lstDeg - raDeg) * DEG2RAD;
  const d = decDeg * DEG2RAD;
  const p = latDeg * DEG2RAD;
  const sinAlt = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  const y = Math.cos(d) * Math.sin(H);
  const x = Math.cos(d) * Math.cos(H) * Math.sin(p) - Math.sin(d) * Math.cos(p);
  const azS = Math.atan2(y, x);
  return { altDeg: alt * RAD2DEG, azDeg: norm360(azS * RAD2DEG + 180) };
}

/** Altitude only (fast path for bulk scanning). */
export function altitudeDeg(raDeg: number, decDeg: number, latDeg: number, lstDeg: number): number {
  const H = (lstDeg - raDeg) * DEG2RAD;
  const d = decDeg * DEG2RAD;
  const p = latDeg * DEG2RAD;
  const s = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H);
  return Math.asin(clamp(s, -1, 1)) * RAD2DEG;
}

/** Great-circle angular separation (degrees) using the numerically stable Vincenty form. */
export function angularSeparationDeg(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number,
): number {
  const dra = (ra2Deg - ra1Deg) * DEG2RAD;
  const d1 = dec1Deg * DEG2RAD;
  const d2 = dec2Deg * DEG2RAD;
  const sd1 = Math.sin(d1);
  const cd1 = Math.cos(d1);
  const sd2 = Math.sin(d2);
  const cd2 = Math.cos(d2);
  const num1 = cd2 * Math.sin(dra);
  const num2 = cd1 * sd2 - sd1 * cd2 * Math.cos(dra);
  const den = sd1 * sd2 + cd1 * cd2 * Math.cos(dra);
  return Math.atan2(Math.hypot(num1, num2), den) * RAD2DEG;
}

/**
 * Position angle (degrees, North through East) of point 2 as seen from point 1.
 */
export function positionAngleDeg(
  ra1Deg: number,
  dec1Deg: number,
  ra2Deg: number,
  dec2Deg: number,
): number {
  const dra = (ra2Deg - ra1Deg) * DEG2RAD;
  const d1 = dec1Deg * DEG2RAD;
  const d2 = dec2Deg * DEG2RAD;
  const y = Math.sin(dra) * Math.cos(d2);
  const x = Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(dra);
  return norm360(Math.atan2(y, x) * RAD2DEG);
}

/**
 * Parallactic angle q (degrees): angle between the direction to the celestial
 * pole and the zenith, measured at the object. Needed to relate sky position
 * angles to the horizon frame (e.g. for alt-az / fixed-tripod orientation).
 */
export function parallacticAngleDeg(hourAngleDeg: number, decDeg: number, latDeg: number): number {
  const H = hourAngleDeg * DEG2RAD;
  const d = decDeg * DEG2RAD;
  const p = latDeg * DEG2RAD;
  return Math.atan2(Math.sin(H), Math.tan(p) * Math.cos(d) - Math.sin(d) * Math.cos(H)) * RAD2DEG;
}

/** Unit vector for equatorial coordinates (degrees). */
export function toVector(raDeg: number, decDeg: number): [number, number, number] {
  const r = raDeg * DEG2RAD;
  const d = decDeg * DEG2RAD;
  const cd = Math.cos(d);
  return [cd * Math.cos(r), cd * Math.sin(r), Math.sin(d)];
}

export function fromVector(v: readonly [number, number, number]): Equatorial {
  const [x, y, z] = v;
  const r = Math.hypot(x, y, z);
  return { raDeg: norm360(Math.atan2(y, x) * RAD2DEG), decDeg: Math.asin(z / r) * RAD2DEG };
}

/** 3×3 matrix (row-major) applied to a vector. */
export type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export function applyMatrix(
  m: Matrix3,
  v: readonly [number, number, number],
): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Compass direction (16-wind) index 0..15 for an azimuth in degrees. */
export function compassIndex(azDeg: number): number {
  return Math.round(norm360(azDeg) / 22.5) % 16;
}

export const COMPASS_16 = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;
export type CompassPoint = (typeof COMPASS_16)[number];

export function compassPoint(azDeg: number): CompassPoint {
  return COMPASS_16[compassIndex(azDeg)];
}
