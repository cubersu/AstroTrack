import { useMemo } from 'react';
import type { GeoLocation } from '../../astro/coordinates';
import { moonInfo, searchRiseSet } from '../../astro/ephemeris';
import type { CalendarDate } from '../../astro/time';
import {
  addDays,
  formatCalendarDate,
  nightDateForInstant,
  parseCalendarDate,
} from '../../astro/time';
import type { NightInfo } from '../../astro/twilight';
import { computeNight } from '../../astro/twilight';
import type { AppSettings, ObservingLocation } from '../../db/types';
import { useQueryParam } from '../../app/router';

export function geo(loc: ObservingLocation): GeoLocation {
  return { latDeg: loc.latDeg, lonDeg: loc.lonDeg, elevationM: loc.elevationM ?? 0 };
}

/**
 * The night to plan by default: the current night while it is still dark or
 * before dawn; after dawn, the coming evening.
 */
export function defaultPlanningDate(loc: GeoLocation, now = Date.now()): CalendarDate {
  const d = nightDateForInstant(now, loc.lonDeg);
  const n = computeNight(d, loc);
  const end = n.darkEndMs ?? n.sunriseMs ?? n.spanEndMs;
  return now > end ? addDays(d, 1) : d;
}

export function usePlanningDate(
  loc: ObservingLocation | null,
): [CalendarDate | null, (d: CalendarDate | null) => void] {
  const [param, setParam] = useQueryParam('date');
  const date = useMemo(() => {
    if (param) {
      try {
        return parseCalendarDate(param);
      } catch {
        /* ignore malformed */
      }
    }
    return loc ? defaultPlanningDate(geo(loc)) : null;
  }, [param, loc]);
  return [date, (d) => setParam(d ? formatCalendarDate(d) : null)];
}

export interface NightSummaryData {
  night: NightInfo;
  moonIllumination: number;
  moonPhaseLon: number;
  moonriseMs: number | null;
  moonsetMs: number | null;
}

export function useNightSummary(
  loc: ObservingLocation | null,
  date: CalendarDate | null,
): NightSummaryData | null {
  return useMemo(() => {
    if (!loc || !date) return null;
    const g = geo(loc);
    const night = computeNight(date, g);
    const mid =
      night.darkStartMs && night.darkEndMs
        ? (night.darkStartMs + night.darkEndMs) / 2
        : (night.spanStartMs + night.spanEndMs) / 2;
    const mi = moonInfo(mid);
    return {
      night,
      moonIllumination: mi.illumination,
      moonPhaseLon: mi.phaseLonDeg,
      moonriseMs: searchRiseSet('Moon', g, +1, night.spanStartMs - 6 * 3600_000, 1.2),
      moonsetMs: searchRiseSet('Moon', g, -1, night.spanStartMs - 6 * 3600_000, 1.2),
    };
  }, [loc, date]);
}

export function availableHoursFromSettings(s: AppSettings): number | null {
  switch (s.availability) {
    case '30':
      return 0.5;
    case '60':
      return 1;
    case '90':
      return 1.5;
    case 'custom':
      return Math.max(5, s.customAvailabilityMin) / 60;
    default:
      return null;
  }
}
