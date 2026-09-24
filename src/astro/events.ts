/**
 * Non-DSO sky events: informational only. These are deliberately NOT scored
 * with the DSO Astro Score and never ranked against deep-sky targets.
 */
import * as A from 'astronomy-engine';
import { angularSeparationDeg } from './coordinates';
import type { GeoLocation } from './coordinates';
import type { SolarSystemBody } from './ephemeris';
import {
  PLANETS,
  bodyPosition,
  j2000ToOfDate,
  moonInfo,
  observerOf,
  planetInfo,
  precessionMatrix,
  searchRiseSet,
  searchSunLongitude,
  searchTransit,
  toAstroBody,
} from './ephemeris';
import { METEOR_SHOWERS } from './meteorShowers';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from './units';

export type EventKind =
  | 'moon-phase'
  | 'opposition'
  | 'conjunction'
  | 'moon-conjunction'
  | 'elongation'
  | 'lunar-eclipse'
  | 'solar-eclipse'
  | 'meteor-shower'
  | 'occultation'
  | 'comet';

export interface SkyEvent {
  id: string;
  kind: EventKind;
  timeMs: number;
  /** Canonical names of the bodies involved (e.g. ["Moon", "Jupiter"]). */
  bodies: string[];
  /** Event-specific data (all numbers in canonical units). */
  data: Record<string, number | string | boolean | null>;
  /** Whether the event is observable from the given location (null = not applicable). */
  visibleHere: boolean | null;
  /** Suggested focal-length range text, e.g. "100–400 mm". */
  focalRange?: string;
  /** Rare or time-sensitive: highlight in the UI. */
  highlight: boolean;
}

/** Bright stars/clusters near the ecliptic used for Moon conjunctions/occultations (J2000, HYG v4.1). */
export const ECLIPTIC_STARS: Array<{ name: string; raDeg: number; decDeg: number; mag: number }> = [
  { name: 'Aldebaran', raDeg: 68.980155, decDeg: 16.509301, mag: 0.87 },
  { name: 'Regulus', raDeg: 152.09298, decDeg: 11.967207, mag: 1.36 },
  { name: 'Spica', raDeg: 201.298245, decDeg: -11.161322, mag: 0.98 },
  { name: 'Antares', raDeg: 247.35192, decDeg: -26.432002, mag: 1.06 },
  { name: 'Pleiades', raDeg: 56.87115, decDeg: 24.105137, mag: 1.6 },
];

const PHASES = ['new', 'firstQuarter', 'full', 'lastQuarter'] as const;
const NAKED_EYE: SolarSystemBody[] = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
/** Minimum solar elongation for a conjunction to be worth listing (deg). */
const MIN_ELONGATION = 15;

function isDarkEnough(ms: number, loc: GeoLocation): boolean {
  return bodyPosition('Sun', ms, loc).altDeg < -6;
}

/** Best observable altitude of a body within ±`spanH` hours of an instant while the Sun is below −6°. */
function bestAltitudeNear(body: SolarSystemBody, loc: GeoLocation, ms: number, spanH = 10): number {
  let best = -90;
  for (let t = ms - spanH * MS_PER_HOUR; t <= ms + spanH * MS_PER_HOUR; t += 30 * MS_PER_MINUTE) {
    if (!isDarkEnough(t, loc)) continue;
    best = Math.max(best, bodyPosition(body, t, loc).altDeg);
  }
  return best;
}

function geoSeparation(a: SolarSystemBody, b: SolarSystemBody, ms: number): number {
  const d = new Date(ms);
  const va = A.GeoVector(toAstroBody(a), d, true);
  const vb = A.GeoVector(toAstroBody(b), d, true);
  return A.AngleBetween(va, vb);
}

/** Golden-section refinement of a separation minimum within [a, b]. */
function refineMinimum(
  f: (ms: number) => number,
  a: number,
  b: number,
  tolMs = MS_PER_MINUTE * 10,
): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  let fc = f(c);
  let fd = f(d);
  while (b - a > tolMs) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - g * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + g * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

export function moonPhaseEvents(startMs: number, endMs: number): SkyEvent[] {
  const out: SkyEvent[] = [];
  let mq = A.SearchMoonQuarter(new Date(startMs));
  while (mq.time.date.getTime() <= endMs) {
    const t = mq.time.date.getTime();
    out.push({
      id: `phase-${t}`,
      kind: 'moon-phase',
      timeMs: t,
      bodies: ['Moon'],
      data: { phase: PHASES[mq.quarter] },
      visibleHere: null,
      highlight: false,
    });
    mq = A.NextMoonQuarter(mq);
  }
  return out;
}

export function oppositionEvents(startMs: number, endMs: number, loc: GeoLocation): SkyEvent[] {
  const out: SkyEvent[] = [];
  for (const body of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'] as SolarSystemBody[]) {
    const t = A.SearchRelativeLongitude(toAstroBody(body), 0, new Date(startMs)).date.getTime();
    if (t > endMs) continue;
    const info = planetInfo(body, t, loc);
    out.push({
      id: `opp-${body}-${t}`,
      kind: 'opposition',
      timeMs: t,
      bodies: [body],
      data: {
        mag: info.magnitude,
        diameterArcsec: info.diameterArcsec,
        distAu: info.position.distAu,
      },
      visibleHere: bestAltitudeNear(body, loc, t, 12) > 10,
      focalRange: body === 'Uranus' || body === 'Neptune' ? '600–2000 mm' : '1000 mm+',
      highlight: body === 'Mars',
    });
  }
  return out;
}

export function elongationEvents(startMs: number, endMs: number, loc: GeoLocation): SkyEvent[] {
  const out: SkyEvent[] = [];
  for (const body of ['Mercury', 'Venus'] as SolarSystemBody[]) {
    let t0 = startMs;
    for (let k = 0; k < 6; k++) {
      const e = A.SearchMaxElongation(toAstroBody(body), new Date(t0));
      const t = e.time.date.getTime();
      if (t > endMs) break;
      out.push({
        id: `elong-${body}-${t}`,
        kind: 'elongation',
        timeMs: t,
        bodies: [body],
        data: { elongationDeg: e.elongation, side: e.visibility === 'evening' ? 'east' : 'west' },
        visibleHere: bestAltitudeNear(body, loc, t, 6) > 5,
        focalRange: '50–300 mm',
        highlight: false,
      });
      t0 = t + 10 * MS_PER_DAY;
    }
  }
  return out;
}

export function planetConjunctionEvents(
  startMs: number,
  endMs: number,
  loc: GeoLocation,
  maxSepDeg = 3,
): SkyEvent[] {
  const out: SkyEvent[] = [];
  const bodies = [...NAKED_EYE, 'Uranus', 'Neptune'] as SolarSystemBody[];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (!NAKED_EYE.includes(a) && !NAKED_EYE.includes(b)) continue;
      const step = MS_PER_DAY / 2;
      let prev2 = Infinity;
      let prev1 = geoSeparation(a, b, startMs - step);
      for (let t = startMs; t <= endMs + step; t += step) {
        const s = geoSeparation(a, b, t);
        if (prev1 < prev2 && prev1 <= s && prev1 < maxSepDeg + 1) {
          const tm = refineMinimum((ms) => geoSeparation(a, b, ms), t - 2 * step, t);
          const sep = geoSeparation(a, b, tm);
          const elong = Math.min(
            A.AngleFromSun(toAstroBody(a), new Date(tm)),
            A.AngleFromSun(toAstroBody(b), new Date(tm)),
          );
          if (sep <= maxSepDeg && elong >= MIN_ELONGATION && tm >= startMs && tm <= endMs) {
            out.push({
              id: `conj-${a}-${b}-${Math.round(tm / MS_PER_HOUR)}`,
              kind: 'conjunction',
              timeMs: tm,
              bodies: [a, b],
              data: { separationDeg: sep, elongationDeg: elong },
              visibleHere: bestAltitudeNear(NAKED_EYE.includes(a) ? a : b, loc, tm, 14) > 5,
              focalRange: sep < 0.5 ? '400–1000 mm' : sep < 1.5 ? '200–600 mm' : '100–300 mm',
              highlight: sep < 1,
            });
          }
        }
        prev2 = prev1;
        prev1 = s;
      }
    }
  }
  return out;
}

/** Topocentric Moon ↔ fixed point separation (deg). */
function moonSepToFixed(ms: number, loc: GeoLocation, raOfDate: number, decOfDate: number): number {
  const m = bodyPosition('Moon', ms, loc);
  return angularSeparationDeg(m.raDeg, m.decDeg, raOfDate, decOfDate);
}

function moonSepToBody(ms: number, loc: GeoLocation, body: SolarSystemBody): number {
  const m = bodyPosition('Moon', ms, loc);
  const p = bodyPosition(body, ms, loc);
  return angularSeparationDeg(m.raDeg, m.decDeg, p.raDeg, p.decDeg);
}

/** Moon semi-diameter (deg) from topocentric distance. */
function moonSemiDiameterDeg(ms: number, loc: GeoLocation): number {
  const d = bodyPosition('Moon', ms, loc).distAu * 149597870.7;
  return (Math.asin(1737.4 / d) * 180) / Math.PI;
}

export function moonConjunctionEvents(
  startMs: number,
  endMs: number,
  loc: GeoLocation,
  maxSepDeg = 4,
): SkyEvent[] {
  const out: SkyEvent[] = [];
  const step = 2 * MS_PER_HOUR;
  type Target = {
    name: string;
    sep: (ms: number) => number;
    mag: number;
    isStar: boolean;
    body?: SolarSystemBody;
  };
  const pm = precessionMatrix((startMs + endMs) / 2);
  const targets: Target[] = [
    ...NAKED_EYE.map((b) => ({
      name: b,
      body: b,
      sep: (ms: number) => moonSepToBody(ms, loc, b),
      mag: 0,
      isStar: false,
    })),
    ...ECLIPTIC_STARS.map((s) => {
      const p = j2000ToOfDate({ raDeg: s.raDeg, decDeg: s.decDeg }, pm);
      return {
        name: s.name,
        sep: (ms: number) => moonSepToFixed(ms, loc, p.raDeg, p.decDeg),
        mag: s.mag,
        isStar: true,
      };
    }),
  ];
  for (const tg of targets) {
    let prev2 = Infinity;
    let prev1 = tg.sep(startMs - step);
    for (let t = startMs; t <= endMs + step; t += step) {
      const s = tg.sep(t);
      if (prev1 < prev2 && prev1 <= s && prev1 < maxSepDeg + 2) {
        const tm = refineMinimum(tg.sep, t - 2 * step, t, MS_PER_MINUTE * 2);
        const sep = tg.sep(tm);
        if (tm >= startMs && tm <= endMs && sep <= maxSepDeg) {
          const moonAlt = bodyPosition('Moon', tm, loc).altDeg;
          const dark = isDarkEnough(tm, loc);
          const elong = tg.body ? A.AngleFromSun(toAstroBody(tg.body), new Date(tm)) : 180;
          if (elong >= MIN_ELONGATION) {
            const occ = sep < moonSemiDiameterDeg(tm, loc);
            out.push({
              id: `moonconj-${tg.name}-${Math.round(tm / MS_PER_HOUR)}`,
              kind: occ ? 'occultation' : 'moon-conjunction',
              timeMs: tm,
              bodies: ['Moon', tg.name],
              data: {
                separationDeg: sep,
                moonAltDeg: moonAlt,
                illumination: moonInfo(tm).illumination,
              },
              visibleHere: moonAlt > 5 && dark,
              focalRange: occ ? '400 mm+' : sep < 1.5 ? '200–600 mm' : '85–300 mm',
              highlight: occ || sep < 1,
            });
          }
        }
      }
      prev2 = prev1;
      prev1 = s;
    }
  }
  return out;
}

export function eclipseEvents(startMs: number, endMs: number, loc: GeoLocation): SkyEvent[] {
  const out: SkyEvent[] = [];
  let le = A.SearchLunarEclipse(new Date(startMs));
  while (le.peak.date.getTime() <= endMs) {
    const t = le.peak.date.getTime();
    const moonAlt = bodyPosition('Moon', t, loc).altDeg;
    out.push({
      id: `lecl-${t}`,
      kind: 'lunar-eclipse',
      timeMs: t,
      bodies: ['Moon'],
      data: {
        eclipseKind: le.kind,
        obscuration: le.obscuration,
        semiPenumbralMin: le.sd_penum,
        semiPartialMin: le.sd_partial,
        semiTotalMin: le.sd_total,
        moonAltDeg: moonAlt,
      },
      visibleHere: moonAlt > 0,
      focalRange: '300–1000 mm',
      highlight: true,
    });
    le = A.NextLunarEclipse(le.peak);
  }
  const obs = observerOf(loc);
  let se = A.SearchGlobalSolarEclipse(new Date(startMs));
  while (se.peak.date.getTime() <= endMs) {
    const t = se.peak.date.getTime();
    // Local circumstances for the same eclipse (search from a day before the global peak).
    let local: A.LocalSolarEclipseInfo | null = null;
    try {
      const l = A.SearchLocalSolarEclipse(new Date(t - MS_PER_DAY), obs);
      if (Math.abs(l.peak.time.date.getTime() - t) < 0.5 * MS_PER_DAY) local = l;
    } catch {
      local = null;
    }
    const visible = local !== null && local.peak.altitude > 0;
    out.push({
      id: `secl-${t}`,
      kind: 'solar-eclipse',
      timeMs: local ? local.peak.time.date.getTime() : t,
      bodies: ['Sun', 'Moon'],
      data: {
        eclipseKind: se.kind,
        localKind: local?.kind ?? null,
        localObscuration: local ? local.obscuration : null,
        sunAltDeg: local ? local.peak.altitude : null,
      },
      visibleHere: visible,
      focalRange: '400–1000 mm (solar filter!)',
      highlight: true,
    });
    se = A.NextGlobalSolarEclipse(se.peak);
  }
  return out;
}

export function meteorShowerEvents(startMs: number, endMs: number, loc: GeoLocation): SkyEvent[] {
  const out: SkyEvent[] = [];
  for (const sh of METEOR_SHOWERS) {
    let from = startMs - 2 * MS_PER_DAY;
    for (let k = 0; k < 3; k++) {
      const t = searchSunLongitude(sh.peakSolarLonDeg, from, 370);
      if (t === null || t > endMs) break;
      if (t >= startMs - MS_PER_DAY) {
        // Best radiant altitude during darkness in the ±12 h around the peak.
        const pm = precessionMatrix(t);
        const rad = j2000ToOfDate({ raDeg: sh.radiantRaDeg, decDeg: sh.radiantDecDeg }, pm);
        let bestAlt = -90;
        let bestT = t;
        for (let s = t - 12 * MS_PER_HOUR; s <= t + 12 * MS_PER_HOUR; s += 30 * MS_PER_MINUTE) {
          if (!isDarkEnough(s, loc)) continue;
          const h = A.Horizon(new Date(s), observerOf(loc), rad.raDeg / 15, rad.decDeg);
          if (h.altitude > bestAlt) {
            bestAlt = h.altitude;
            bestT = s;
          }
        }
        out.push({
          id: `met-${sh.code}-${t}`,
          kind: 'meteor-shower',
          timeMs: t,
          bodies: [sh.name],
          data: {
            code: sh.code,
            zhr: sh.zhr,
            velocityKms: sh.velocityKms,
            radiantAltDeg: bestAlt,
            bestTimeMs: bestT,
            moonIllumination: moonInfo(t).illumination,
          },
          visibleHere: bestAlt > 15,
          focalRange: '14–24 mm',
          highlight: sh.zhr >= 50,
        });
      }
      from = t + 300 * MS_PER_DAY;
    }
  }
  return out;
}

export interface EventOptions {
  include?: Partial<Record<EventKind, boolean>>;
}

/** All events in a period, sorted by time. */
export function computeEvents(startMs: number, endMs: number, loc: GeoLocation): SkyEvent[] {
  const all = [
    ...moonPhaseEvents(startMs, endMs),
    ...oppositionEvents(startMs, endMs, loc),
    ...elongationEvents(startMs, endMs, loc),
    ...planetConjunctionEvents(startMs, endMs, loc),
    ...moonConjunctionEvents(startMs, endMs, loc),
    ...eclipseEvents(startMs, endMs, loc),
    ...meteorShowerEvents(startMs, endMs, loc),
  ];
  return all.sort((a, b) => a.timeMs - b.timeMs);
}

export interface PlanetVisibility {
  body: SolarSystemBody;
  magnitude: number;
  diameterArcsec: number;
  elongationDeg: number;
  illumination: number;
  riseMs: number | null;
  transitMs: number | null;
  setMs: number | null;
  /** Visible span with altitude > 10° while the Sun is below −6°. */
  visibleFromMs: number | null;
  visibleToMs: number | null;
  maxAltDeg: number;
}

/** Planet visibility over a night span [startMs, endMs]. */
export function planetsTonight(
  startMs: number,
  endMs: number,
  loc: GeoLocation,
): PlanetVisibility[] {
  return PLANETS.map((body) => {
    const mid = (startMs + endMs) / 2;
    const info = planetInfo(body, mid, loc);
    let from: number | null = null;
    let to: number | null = null;
    let maxAlt = -90;
    for (let t = startMs; t <= endMs; t += 15 * MS_PER_MINUTE) {
      const sun = bodyPosition('Sun', t, loc).altDeg;
      const alt = bodyPosition(body, t, loc).altDeg;
      if (sun < -6 && alt > 10) {
        if (from === null) from = t;
        to = t;
        maxAlt = Math.max(maxAlt, alt);
      }
    }
    return {
      body,
      magnitude: info.magnitude,
      diameterArcsec: info.diameterArcsec,
      elongationDeg: info.elongationDeg,
      illumination: info.illumination,
      riseMs: searchRiseSet(body, loc, +1, startMs - 6 * MS_PER_HOUR, 1),
      transitMs: searchTransit(body, loc, startMs - 6 * MS_PER_HOUR),
      setMs: searchRiseSet(body, loc, -1, startMs - 6 * MS_PER_HOUR, 1),
      visibleFromMs: from,
      visibleToMs: to,
      maxAltDeg: maxAlt,
    };
  });
}
