/**
 * Thin adapter around Astronomy Engine (MIT, https://github.com/cosinekitty/astronomy).
 *
 * All Sun/Moon/planet ephemerides are computed locally; no network access is
 * ever required. The rest of the engine talks to this module only, so the
 * underlying library could be swapped without touching domain logic.
 */
import * as A from 'astronomy-engine';
import type { Equatorial, GeoLocation, Horizontal, Matrix3 } from './coordinates';
import { applyMatrix, fromVector, toVector } from './coordinates';
import { norm360 } from './units';

export type SolarSystemBody =
  'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Uranus' | 'Neptune';

export const PLANETS: readonly SolarSystemBody[] = [
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
];

const BODY: Record<SolarSystemBody, A.Body> = {
  Sun: A.Body.Sun,
  Moon: A.Body.Moon,
  Mercury: A.Body.Mercury,
  Venus: A.Body.Venus,
  Mars: A.Body.Mars,
  Jupiter: A.Body.Jupiter,
  Saturn: A.Body.Saturn,
  Uranus: A.Body.Uranus,
  Neptune: A.Body.Neptune,
};

export function toAstroBody(body: SolarSystemBody): A.Body {
  return BODY[body];
}

export function observerOf(loc: GeoLocation): A.Observer {
  return new A.Observer(loc.latDeg, loc.lonDeg, loc.elevationM ?? 0);
}

export function astroTime(ms: number): A.AstroTime {
  return A.MakeTime(new Date(ms));
}

/** Greenwich apparent sidereal time in degrees. */
export function gastDeg(ms: number): number {
  return A.SiderealTime(new Date(ms)) * 15;
}

/** Local apparent sidereal time in degrees. */
export function lstDeg(ms: number, lonDeg: number): number {
  return norm360(gastDeg(ms) + lonDeg);
}

/** Precession + nutation matrix J2000 (EQJ) → true equator/equinox of date (EQD). */
export function precessionMatrix(ms: number): Matrix3 {
  const r = A.Rotation_EQJ_EQD(new Date(ms)).rot;
  // Astronomy Engine stores rotation matrices column-major: rot[i][j] maps
  // component i of the input to component j of the output.
  return [
    [r[0][0], r[1][0], r[2][0]],
    [r[0][1], r[1][1], r[2][1]],
    [r[0][2], r[1][2], r[2][2]],
  ];
}

/** Precess a J2000 position to the true equator/equinox of the given instant. */
export function j2000ToOfDate(pos: Equatorial, m: Matrix3): Equatorial {
  return fromVector(applyMatrix(m, toVector(pos.raDeg, pos.decDeg)));
}

export interface BodyPosition {
  /** Topocentric RA/Dec of date, degrees (includes aberration). */
  raDeg: number;
  decDeg: number;
  /** Geometric (airless) altitude/azimuth. */
  altDeg: number;
  azDeg: number;
  /** Distance in AU. */
  distAu: number;
}

export function bodyPosition(body: SolarSystemBody, ms: number, loc: GeoLocation): BodyPosition {
  const obs = observerOf(loc);
  const date = new Date(ms);
  const eq = A.Equator(BODY[body], date, obs, true, true);
  const hor = A.Horizon(date, obs, eq.ra, eq.dec);
  return {
    raDeg: eq.ra * 15,
    decDeg: eq.dec,
    altDeg: hor.altitude,
    azDeg: hor.azimuth,
    distAu: eq.dist,
  };
}

/** Horizontal coordinates for an of-date RA/Dec using Astronomy Engine (reference implementation). */
export function horizonReference(
  ms: number,
  loc: GeoLocation,
  raOfDateDeg: number,
  decOfDateDeg: number,
  refraction = false,
): Horizontal {
  const h = A.Horizon(
    new Date(ms),
    observerOf(loc),
    raOfDateDeg / 15,
    decOfDateDeg,
    refraction ? 'normal' : undefined,
  );
  return { altDeg: h.altitude, azDeg: h.azimuth };
}

export interface MoonInfo {
  /** Illuminated fraction 0..1 */
  illumination: number;
  /** Sun–Moon–Earth phase angle in degrees (0 = full, 180 = new). */
  phaseAngleDeg: number;
  /** Moon phase as ecliptic longitude difference 0..360 (0 new, 90 first quarter, 180 full, 270 last quarter). */
  phaseLonDeg: number;
  /** True while the illuminated fraction is increasing. */
  waxing: boolean;
}

export function moonInfo(ms: number): MoonInfo {
  const date = new Date(ms);
  const ill = A.Illumination(A.Body.Moon, date);
  const phaseLon = A.MoonPhase(date);
  return {
    illumination: ill.phase_fraction,
    phaseAngleDeg: ill.phase_angle,
    phaseLonDeg: phaseLon,
    waxing: phaseLon < 180,
  };
}

export type MoonPhaseName =
  | 'new'
  | 'waxingCrescent'
  | 'firstQuarter'
  | 'waxingGibbous'
  | 'full'
  | 'waningGibbous'
  | 'lastQuarter'
  | 'waningCrescent';

export function moonPhaseName(phaseLonDeg: number): MoonPhaseName {
  const p = norm360(phaseLonDeg);
  if (p < 11.25 || p >= 348.75) return 'new';
  if (p < 78.75) return 'waxingCrescent';
  if (p < 101.25) return 'firstQuarter';
  if (p < 168.75) return 'waxingGibbous';
  if (p < 191.25) return 'full';
  if (p < 258.75) return 'waningGibbous';
  if (p < 281.25) return 'lastQuarter';
  return 'waningCrescent';
}

/** Search for the next time a body crosses the given altitude (degrees). */
export function searchAltitude(
  body: SolarSystemBody,
  loc: GeoLocation,
  direction: 1 | -1,
  startMs: number,
  limitDays: number,
  altitudeDeg: number,
): number | null {
  const t = A.SearchAltitude(
    BODY[body],
    observerOf(loc),
    direction,
    new Date(startMs),
    limitDays,
    altitudeDeg,
  );
  return t ? t.date.getTime() : null;
}

/** Next rise (+1) or set (−1) of a body (upper limb, standard refraction). */
export function searchRiseSet(
  body: SolarSystemBody,
  loc: GeoLocation,
  direction: 1 | -1,
  startMs: number,
  limitDays: number,
): number | null {
  const t = A.SearchRiseSet(BODY[body], observerOf(loc), direction, new Date(startMs), limitDays);
  return t ? t.date.getTime() : null;
}

/** Next upper culmination (hour angle 0) of a body. */
export function searchTransit(body: SolarSystemBody, loc: GeoLocation, startMs: number): number {
  return A.SearchHourAngle(
    BODY[body],
    observerOf(loc),
    0,
    new Date(startMs),
    +1,
  ).time.date.getTime();
}

export interface PlanetInfo {
  body: SolarSystemBody;
  position: BodyPosition;
  magnitude: number;
  /** Angular diameter in arcseconds (approximate, from mean radius). */
  diameterArcsec: number;
  elongationDeg: number;
  illumination: number;
}

/** Mean equatorial radii in km (IAU). */
const RADIUS_KM: Record<SolarSystemBody, number> = {
  Sun: 695700,
  Moon: 1737.4,
  Mercury: 2440.5,
  Venus: 6051.8,
  Mars: 3396.2,
  Jupiter: 71492,
  Saturn: 60268,
  Uranus: 25559,
  Neptune: 24764,
};
const AU_KM = 149597870.7;

export function angularDiameterArcsec(body: SolarSystemBody, distAu: number): number {
  return ((2 * RADIUS_KM[body]) / (distAu * AU_KM)) * 206264.80624709636;
}

export function planetInfo(body: SolarSystemBody, ms: number, loc: GeoLocation): PlanetInfo {
  const date = new Date(ms);
  const position = bodyPosition(body, ms, loc);
  const ill = A.Illumination(BODY[body], date);
  return {
    body,
    position,
    magnitude: ill.mag,
    diameterArcsec: angularDiameterArcsec(body, position.distAu),
    elongationDeg: body === 'Sun' ? 0 : A.AngleFromSun(BODY[body], date),
    illumination: ill.phase_fraction,
  };
}

/** Heliocentric J2000 equatorial position of Earth in AU. */
export function earthHelioAu(ms: number): [number, number, number] {
  const v = A.HelioVector(A.Body.Earth, new Date(ms));
  return [v.x, v.y, v.z];
}

/** Ecliptic longitude of the Sun (true equinox of date), degrees. */
export function sunEclipticLongitude(ms: number): number {
  return A.SunPosition(new Date(ms)).elon;
}

export function searchSunLongitude(
  lonDeg: number,
  startMs: number,
  limitDays: number,
): number | null {
  const t = A.SearchSunLongitude(lonDeg, new Date(startMs), limitDays);
  return t ? t.date.getTime() : null;
}

export { A as AstronomyEngine };
