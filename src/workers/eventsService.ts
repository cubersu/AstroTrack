/** Event and comet computations for the worker (informational; no DSO scoring). */
import type { CometElements } from '../astro/comets';
import { cometPosition, parseMpcCometFile, perihelionMs } from '../astro/comets';
import type { GeoLocation } from '../astro/coordinates';
import { equatorialToHorizontal } from '../astro/coordinates';
import { bodyPosition, j2000ToOfDate, lstDeg, precessionMatrix } from '../astro/ephemeris';
import type { PlanetVisibility, SkyEvent } from '../astro/events';
import { computeEvents, planetsTonight } from '../astro/events';
import { dataDb } from '../data/dataDb';
import { MS_PER_DAY, MS_PER_MINUTE } from '../astro/units';

export interface CometView {
  designation: string;
  magnitude: number | null;
  raDeg: number;
  decDeg: number;
  rAu: number;
  deltaAu: number;
  elongationDeg: number;
  perihelionMs: number;
  /** Visible window (alt > 15°, Sun < −12°) during the night, if any. */
  visibleFromMs: number | null;
  visibleToMs: number | null;
  maxAltDeg: number;
}

export interface CometOpportunity {
  designation: string;
  bestDateMs: number;
  bestMagnitude: number | null;
  maxAltDeg: number;
}

let cometCache: { fetchedAt: number; comets: CometElements[] } | null = null;

async function loadComets(): Promise<CometElements[]> {
  const rec = await dataDb().cometData.get('comets');
  if (!rec) {
    cometCache = null;
    return [];
  }
  if (!cometCache || cometCache.fetchedAt !== rec.fetchedAt) {
    cometCache = { fetchedAt: rec.fetchedAt, comets: parseMpcCometFile(rec.text).comets };
  }
  return cometCache.comets;
}

function nightVisibility(
  c: CometElements,
  loc: GeoLocation,
  startMs: number,
  endMs: number,
): { from: number | null; to: number | null; maxAlt: number } {
  let from: number | null = null;
  let to: number | null = null;
  let maxAlt = -90;
  const pm = precessionMatrix((startMs + endMs) / 2);
  const pos = cometPosition(c, (startMs + endMs) / 2);
  const pod = j2000ToOfDate(pos, pm);
  for (let t = startMs; t <= endMs; t += 20 * MS_PER_MINUTE) {
    if (bodyPosition('Sun', t, loc).altDeg > -12) continue;
    const h = equatorialToHorizontal(pod.raDeg, pod.decDeg, loc.latDeg, lstDeg(t, loc.lonDeg));
    if (h.altDeg > maxAlt) maxAlt = h.altDeg;
    if (h.altDeg > 15) {
      if (from === null) from = t;
      to = t;
    }
  }
  return { from, to, maxAlt };
}

export const eventsService = {
  events(startMs: number, endMs: number, loc: GeoLocation): SkyEvent[] {
    return computeEvents(startMs, endMs, loc);
  },
  planets(startMs: number, endMs: number, loc: GeoLocation): PlanetVisibility[] {
    return planetsTonight(startMs, endMs, loc);
  },
  async cometsTonight(
    startMs: number,
    endMs: number,
    loc: GeoLocation,
    magLimit = 12,
  ): Promise<CometView[]> {
    const comets = await loadComets();
    const mid = (startMs + endMs) / 2;
    const out: CometView[] = [];
    for (const c of comets) {
      const p = cometPosition(c, mid);
      if (p.magnitude === null || p.magnitude > magLimit) continue;
      const v = nightVisibility(c, loc, startMs, endMs);
      out.push({
        designation: c.designation,
        magnitude: p.magnitude,
        raDeg: p.raDeg,
        decDeg: p.decDeg,
        rAu: p.rAu,
        deltaAu: p.deltaAu,
        elongationDeg: p.elongationDeg,
        perihelionMs: perihelionMs(c),
        visibleFromMs: v.from,
        visibleToMs: v.to,
        maxAltDeg: v.maxAlt,
      });
    }
    return out.sort((a, b) => (a.magnitude ?? 99) - (b.magnitude ?? 99));
  },
  /** Brightest predicted, observable date per comet over the next `days` days. */
  async cometOpportunities(
    startMs: number,
    days: number,
    loc: GeoLocation,
    magLimit = 11,
  ): Promise<CometOpportunity[]> {
    const comets = await loadComets();
    const out: CometOpportunity[] = [];
    for (const c of comets) {
      let best: CometOpportunity | null = null;
      for (let d = 0; d < days; d += 3) {
        const t = startMs + d * MS_PER_DAY;
        const p = cometPosition(c, t);
        if (p.magnitude === null || p.magnitude > magLimit) continue;
        const v = nightVisibility(c, loc, t - 6 * 3600_000, t + 6 * 3600_000);
        if (v.maxAlt < 15) continue;
        if (!best || (p.magnitude ?? 99) < (best.bestMagnitude ?? 99)) {
          best = {
            designation: c.designation,
            bestDateMs: t,
            bestMagnitude: p.magnitude,
            maxAltDeg: v.maxAlt,
          };
        }
      }
      if (best) out.push(best);
    }
    return out.sort((a, b) => (a.bestMagnitude ?? 99) - (b.bestMagnitude ?? 99));
  },
};
