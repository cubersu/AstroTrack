/**
 * Deep-sky object visibility: altitude curves, rise/transit/set and usable
 * imaging windows. Fixed (catalogue J2000) positions are precessed to the
 * equinox of date once per night; per-sample altitudes then only need the
 * local sidereal time, which makes bulk scanning of large catalogues cheap.
 */
import { airmass } from './airmass';
import type { Equatorial, GeoLocation } from './coordinates';
import { altitudeDeg, equatorialToHorizontal } from './coordinates';
import { j2000ToOfDate, lstDeg } from './ephemeris';
import type { NightGrid } from './nightGrid';
import { DEG2RAD, MS_PER_HOUR, MS_PER_MINUTE, RAD2DEG, SIDEREAL_RATE, normHours12 } from './units';

/** Standard altitude for rise/set of a point source including mean refraction (−34′). */
export const RISE_SET_ALTITUDE_DEG = -0.5667;

export interface AltitudeCurve {
  /** Altitudes (degrees) aligned with grid.times. */
  alt: Float32Array;
  maxAltDeg: number;
  /** Index of the maximum altitude sample. */
  maxIndex: number;
}

export function altitudeCurve(grid: NightGrid, posOfDate: Equatorial): AltitudeCurve {
  const n = grid.times.length;
  const alt = new Float32Array(n);
  let maxAlt = -91;
  let maxIndex = 0;
  const lat = grid.location.latDeg;
  for (let i = 0; i < n; i++) {
    const a = altitudeDeg(posOfDate.raDeg, posOfDate.decDeg, lat, grid.lst[i]);
    alt[i] = a;
    if (a > maxAlt) {
      maxAlt = a;
      maxIndex = i;
    }
  }
  return { alt, maxAltDeg: maxAlt, maxIndex };
}

/** Maximum altitude an object can ever reach from a latitude (upper culmination). */
export function culminationAltitudeDeg(decDeg: number, latDeg: number): number {
  return 90 - Math.abs(latDeg - decDeg);
}

/** True if the object never rises above `altDeg` at this latitude. */
export function neverRisesAbove(decDeg: number, latDeg: number, altDeg = 0): boolean {
  return culminationAltitudeDeg(decDeg, latDeg) < altDeg;
}

/** True if the object never sets below `altDeg` (circumpolar with respect to that altitude). */
export function alwaysAbove(decDeg: number, latDeg: number, altDeg = 0): boolean {
  // Lower culmination altitude = |lat + dec| − 90 with signs handled.
  const lower = -90 + Math.abs(latDeg + decDeg);
  return (latDeg >= 0 ? decDeg > 0 : decDeg < 0) && lower > altDeg;
}

export interface RiseTransitSet {
  /** Upper culmination (transit) nearest after `fromMs` minus half a day. */
  transitMs: number;
  transitAltDeg: number;
  riseMs: number | null;
  setMs: number | null;
  circumpolar: boolean;
  neverRises: boolean;
}

/**
 * Analytic rise/transit/set for a fixed of-date position around a reference
 * instant. The transit returned is the one closest to `aroundMs`; rise is the
 * one preceding it and set the one following it.
 *
 * cos H0 = (sin h0 − sin φ sin δ) / (cos φ cos δ)
 */
export function riseTransitSet(
  posOfDate: Equatorial,
  loc: GeoLocation,
  aroundMs: number,
  h0Deg = RISE_SET_ALTITUDE_DEG,
): RiseTransitSet {
  const lst0 = lstDeg(aroundMs, loc.lonDeg);
  const dH = normHours12((posOfDate.raDeg - lst0) / 15); // sidereal hours until transit
  const transitMs = aroundMs + (dH / SIDEREAL_RATE) * MS_PER_HOUR;
  const phi = loc.latDeg * DEG2RAD;
  const dec = posOfDate.decDeg * DEG2RAD;
  const transitAltDeg = culminationAltitudeDeg(posOfDate.decDeg, loc.latDeg);
  const cosH0 =
    (Math.sin(h0Deg * DEG2RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH0 < -1) {
    return {
      transitMs,
      transitAltDeg,
      riseMs: null,
      setMs: null,
      circumpolar: true,
      neverRises: false,
    };
  }
  if (cosH0 > 1) {
    return {
      transitMs,
      transitAltDeg,
      riseMs: null,
      setMs: null,
      circumpolar: false,
      neverRises: true,
    };
  }
  const H0h = (Math.acos(cosH0) * RAD2DEG) / 15;
  const half = (H0h / SIDEREAL_RATE) * MS_PER_HOUR;
  return {
    transitMs,
    transitAltDeg,
    riseMs: transitMs - half,
    setMs: transitMs + half,
    circumpolar: false,
    neverRises: false,
  };
}

export interface TimeWindow {
  startMs: number;
  endMs: number;
}

export function windowHours(w: TimeWindow | null): number {
  return w ? (w.endMs - w.startMs) / MS_PER_HOUR : 0;
}

/**
 * Contiguous windows (sample-resolution) where `predicate(i)` holds. The
 * window end is the last sample time where the predicate holds plus one step,
 * clamped to the grid span.
 */
export function windowsWhere(grid: NightGrid, predicate: (i: number) => boolean): TimeWindow[] {
  const out: TimeWindow[] = [];
  const stepMs = grid.stepMinutes * MS_PER_MINUTE;
  const n = grid.times.length;
  let start = -1;
  for (let i = 0; i < n; i++) {
    const ok = predicate(i);
    if (ok && start < 0) start = i;
    if ((!ok || i === n - 1) && start >= 0) {
      const endIdx = ok ? i : i - 1;
      const startMs = grid.times[start];
      const endMs = Math.min(grid.times[endIdx] + stepMs, grid.times[n - 1]);
      if (endMs > startMs) out.push({ startMs, endMs });
      start = -1;
    }
  }
  return out;
}

export interface VisibilitySummary {
  posOfDate: Equatorial;
  curve: AltitudeCurve;
  /** Windows during usable darkness with altitude ≥ minAlt. */
  darkWindows: TimeWindow[];
  /** Total hours above minAlt during usable darkness. */
  darkHoursAboveMin: number;
  /** Maximum altitude reached during usable darkness (or −91 if no darkness). */
  maxDarkAltDeg: number;
  rts: RiseTransitSet;
}

export function summarizeVisibility(
  grid: NightGrid,
  posJ2000: Equatorial,
  minAltDeg: number,
): VisibilitySummary {
  const posOfDate = j2000ToOfDate(posJ2000, grid.precession);
  const curve = altitudeCurve(grid, posOfDate);
  const darkWindows = windowsWhere(grid, (i) => grid.dark[i] === 1 && curve.alt[i] >= minAltDeg);
  let hours = 0;
  for (const w of darkWindows) hours += windowHours(w);
  let maxDark = -91;
  for (let i = 0; i < curve.alt.length; i++) {
    if (grid.dark[i] === 1 && curve.alt[i] > maxDark) maxDark = curve.alt[i];
  }
  const mid =
    grid.night.darkStartMs !== null && grid.night.darkEndMs !== null
      ? (grid.night.darkStartMs + grid.night.darkEndMs) / 2
      : (grid.night.spanStartMs + grid.night.spanEndMs) / 2;
  return {
    posOfDate,
    curve,
    darkWindows,
    darkHoursAboveMin: hours,
    maxDarkAltDeg: maxDark,
    rts: riseTransitSet(posOfDate, grid.location, mid),
  };
}

/** Current alt/az of a J2000 position at an instant (geometric, precessed). */
export function currentHorizontal(
  posJ2000: Equatorial,
  loc: GeoLocation,
  ms: number,
  precession: import('./coordinates').Matrix3,
) {
  const p = j2000ToOfDate(posJ2000, precession);
  const h = equatorialToHorizontal(p.raDeg, p.decDeg, loc.latDeg, lstDeg(ms, loc.lonDeg));
  return { ...h, airmass: airmass(h.altDeg), posOfDate: p };
}
