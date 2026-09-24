import { MS_PER_DAY, MS_PER_HOUR } from './units';

/** Julian Date of the Unix epoch (1970-01-01T00:00:00Z). */
export const JD_UNIX_EPOCH = 2440587.5;
/** Julian Date of J2000.0 (2000-01-01T12:00:00 TT ≈ UTC for our purposes). */
export const JD_J2000 = 2451545.0;

export function msToJd(ms: number): number {
  return ms / MS_PER_DAY + JD_UNIX_EPOCH;
}

export function jdToMs(jd: number): number {
  return (jd - JD_UNIX_EPOCH) * MS_PER_DAY;
}

/**
 * The instant used as the anchor of an observing night: approximately local
 * mean noon of the given calendar date at the given longitude. Searching for
 * dusk/dawn from this anchor yields the evening of `date` and the following
 * morning, independent of the device's time zone.
 *
 * @param year  calendar year (local civil date of the evening)
 * @param month 1..12
 * @param day   1..31
 * @param lonDeg geographic longitude, east positive
 */
export function nightAnchorMs(year: number, month: number, day: number, lonDeg: number): number {
  return Date.UTC(year, month - 1, day, 12, 0, 0) - (lonDeg / 15) * MS_PER_HOUR;
}

/** A local calendar date (the evening date of an observing night). */
export interface CalendarDate {
  year: number;
  month: number; // 1..12
  day: number;
}

export function calendarDateFromMs(ms: number, timeZone?: string): CalendarDate {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function formatCalendarDate(d: CalendarDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function parseCalendarDate(s: string): CalendarDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function addDays(d: CalendarDate, n: number): CalendarDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/**
 * The evening date of the observing night that contains `ms` at the given
 * longitude. Before local mean noon the instant belongs to the previous
 * evening's night.
 */
export function nightDateForInstant(ms: number, lonDeg: number): CalendarDate {
  const localMeanMs = ms + (lonDeg / 15) * MS_PER_HOUR;
  const shifted = new Date(localMeanMs - 12 * MS_PER_HOUR);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}
