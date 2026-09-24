/**
 * Night boundaries (sunset, civil/nautical/astronomical twilight, sunrise).
 *
 * Definitions (Sun centre geometric altitude):
 *  - civil twilight:        −6°
 *  - nautical twilight:     −12°
 *  - astronomical twilight: −18°
 * Sunset/sunrise use Astronomy Engine's upper-limb + standard refraction definition.
 */
import type { GeoLocation } from './coordinates';
import { searchAltitude, searchRiseSet } from './ephemeris';
import type { CalendarDate } from './time';
import { nightAnchorMs } from './time';
import { MS_PER_HOUR } from './units';

export type DarknessLevel = 'astronomical' | 'nautical' | 'civil' | 'none';

export interface NightInfo {
  date: CalendarDate;
  anchorMs: number;
  sunsetMs: number | null;
  civilDuskMs: number | null;
  nauticalDuskMs: number | null;
  astroDuskMs: number | null;
  astroDawnMs: number | null;
  nauticalDawnMs: number | null;
  civilDawnMs: number | null;
  sunriseMs: number | null;
  /**
   * The darkest twilight category reached during this night:
   *  - 'astronomical': Sun gets below −18° (true astronomical night exists)
   *  - 'nautical': Sun gets below −12° but not −18°
   *  - 'civil' / 'none': not dark enough for deep-sky imaging
   */
  darkness: DarknessLevel;
  /** Start/end of the usable imaging darkness (astronomical if available, otherwise nautical). */
  darkStartMs: number | null;
  darkEndMs: number | null;
  /** Evaluation span used for curves: sunset (or anchor+4h) to sunrise (or anchor+20h). */
  spanStartMs: number;
  spanEndMs: number;
}

function pair(
  loc: GeoLocation,
  anchorMs: number,
  alt: number,
): { dusk: number | null; dawn: number | null } {
  const dusk = searchAltitude('Sun', loc, -1, anchorMs, 1, alt);
  // Dawn must be searched from dusk (or anchor) forward within the same night.
  const dawn = searchAltitude('Sun', loc, +1, dusk ?? anchorMs, 1, alt);
  if (dusk !== null && dawn !== null && dawn - anchorMs > 36 * MS_PER_HOUR) {
    return { dusk, dawn: null };
  }
  return { dusk, dawn };
}

export function computeNight(date: CalendarDate, loc: GeoLocation): NightInfo {
  const anchorMs = nightAnchorMs(date.year, date.month, date.day, loc.lonDeg);
  const sunsetMs = searchRiseSet('Sun', loc, -1, anchorMs, 1);
  const sunriseMs = searchRiseSet('Sun', loc, +1, sunsetMs ?? anchorMs, 1);
  const civil = pair(loc, anchorMs, -6);
  const nautical = pair(loc, anchorMs, -12);
  const astro = pair(loc, anchorMs, -18);

  // A dusk found more than ~24h after the anchor belongs to a later night.
  const within = (t: number | null) => (t !== null && t - anchorMs < 24 * MS_PER_HOUR ? t : null);
  const astroDusk = within(astro.dusk);
  const nautDusk = within(nautical.dusk);
  const civilDusk = within(civil.dusk);

  let darkness: DarknessLevel = 'none';
  let darkStartMs: number | null = null;
  let darkEndMs: number | null = null;
  if (astroDusk !== null && astro.dawn !== null) {
    darkness = 'astronomical';
    darkStartMs = astroDusk;
    darkEndMs = astro.dawn;
  } else if (nautDusk !== null && nautical.dawn !== null) {
    darkness = 'nautical';
    darkStartMs = nautDusk;
    darkEndMs = nautical.dawn;
  } else if (civilDusk !== null) {
    darkness = 'civil';
  }

  const sunset = within(sunsetMs);
  const spanStartMs = sunset ?? anchorMs + 4 * MS_PER_HOUR;
  let spanEndMs = sunriseMs !== null && sunset !== null ? sunriseMs : anchorMs + 20 * MS_PER_HOUR;
  if (spanEndMs <= spanStartMs) spanEndMs = spanStartMs + 12 * MS_PER_HOUR;

  return {
    date,
    anchorMs,
    sunsetMs: sunset,
    civilDuskMs: civilDusk,
    nauticalDuskMs: nautDusk,
    astroDuskMs: astroDusk,
    astroDawnMs: astroDusk !== null ? astro.dawn : null,
    nauticalDawnMs: nautDusk !== null ? nautical.dawn : null,
    civilDawnMs: civilDusk !== null ? civil.dawn : null,
    sunriseMs: sunset !== null ? sunriseMs : null,
    darkness,
    darkStartMs,
    darkEndMs,
    spanStartMs,
    spanEndMs,
  };
}

/** Duration of usable darkness in hours (0 if none). */
export function darkHours(n: NightInfo): number {
  if (n.darkStartMs === null || n.darkEndMs === null) return 0;
  return (n.darkEndMs - n.darkStartMs) / MS_PER_HOUR;
}
