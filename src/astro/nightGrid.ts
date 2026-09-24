/**
 * A sampled observing night: shared Sun/Moon/sidereal-time series used to
 * evaluate thousands of deep-sky objects cheaply. Everything that does not
 * depend on the target is computed once per (location, night).
 */
import type { GeoLocation, Matrix3 } from './coordinates';
import { equatorialToHorizontal } from './coordinates';
import { bodyPosition, lstDeg, moonInfo, precessionMatrix, type MoonInfo } from './ephemeris';
import type { NightInfo } from './twilight';
import { MS_PER_MINUTE } from './units';

export interface NightGrid {
  location: GeoLocation;
  night: NightInfo;
  stepMinutes: number;
  /** Sample instants (epoch ms). */
  times: Float64Array;
  /** Local apparent sidereal time (degrees) per sample. */
  lst: Float64Array;
  sunAlt: Float64Array;
  moonRa: Float64Array;
  moonDec: Float64Array;
  moonAlt: Float64Array;
  moonAz: Float64Array;
  /** Moon phase angle in degrees per sample (0 = full). */
  moonPhaseAngle: Float64Array;
  moonIllumination: Float64Array;
  /** 1 if the sample lies inside usable darkness (astronomical, or nautical fallback). */
  dark: Uint8Array;
  /** Precession matrix J2000 → of-date at the middle of the night. */
  precession: Matrix3;
  /** Moon summary at the middle of the dark period (or span). */
  moonAtMidnight: MoonInfo;
}

export function buildNightGrid(loc: GeoLocation, night: NightInfo, stepMinutes = 10): NightGrid {
  const start = night.spanStartMs;
  const end = night.spanEndMs;
  const stepMs = stepMinutes * MS_PER_MINUTE;
  const n = Math.max(2, Math.floor((end - start) / stepMs) + 1);
  const times = new Float64Array(n);
  const lst = new Float64Array(n);
  const sunAlt = new Float64Array(n);
  const moonRa = new Float64Array(n);
  const moonDec = new Float64Array(n);
  const moonAlt = new Float64Array(n);
  const moonAz = new Float64Array(n);
  const moonPhaseAngle = new Float64Array(n);
  const moonIllumination = new Float64Array(n);
  const dark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = Math.min(start + i * stepMs, end);
    times[i] = t;
    lst[i] = lstDeg(t, loc.lonDeg);
    sunAlt[i] = bodyPosition('Sun', t, loc).altDeg;
    const m = bodyPosition('Moon', t, loc);
    moonRa[i] = m.raDeg;
    moonDec[i] = m.decDeg;
    moonAlt[i] = m.altDeg;
    moonAz[i] = m.azDeg;
    // Phase changes slowly; sampling each point keeps the code simple and exact enough.
    const mi = moonInfo(t);
    moonPhaseAngle[i] = mi.phaseAngleDeg;
    moonIllumination[i] = mi.illumination;
    dark[i] =
      night.darkStartMs !== null &&
      night.darkEndMs !== null &&
      t >= night.darkStartMs &&
      t <= night.darkEndMs
        ? 1
        : 0;
  }
  const mid =
    night.darkStartMs !== null && night.darkEndMs !== null
      ? (night.darkStartMs + night.darkEndMs) / 2
      : (start + end) / 2;
  return {
    location: loc,
    night,
    stepMinutes,
    times,
    lst,
    sunAlt,
    moonRa,
    moonDec,
    moonAlt,
    moonAz,
    moonPhaseAngle,
    moonIllumination,
    dark,
    precession: precessionMatrix(mid),
    moonAtMidnight: moonInfo(mid),
  };
}

/** Index of the first sample at or after `ms` (clamped). */
export function sampleIndexAt(grid: NightGrid, ms: number): number {
  const { times } = grid;
  if (ms <= times[0]) return 0;
  const stepMs = grid.stepMinutes * MS_PER_MINUTE;
  const i = Math.ceil((ms - times[0]) / stepMs);
  return Math.min(Math.max(i, 0), times.length - 1);
}

export function moonHorizontalAt(grid: NightGrid, i: number) {
  return equatorialToHorizontal(grid.moonRa[i], grid.moonDec[i], grid.location.latDeg, grid.lst[i]);
}
