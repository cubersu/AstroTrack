/**
 * Weather retrieval with a local cache. A network failure never breaks the
 * app: the last cached forecast is returned (flagged stale) or `null`, and
 * the astronomical evaluation continues without weather.
 */
import { scoreHour } from '../astro/weatherScore';
import type { HourlyWeatherScore } from '../astro/weatherScore';
import { dataDb } from '../data/dataDb';
import type { Forecast } from './openMeteo';
import { fetchOpenMeteo, roundCoord } from './openMeteo';

/** A cached forecast younger than this is used without refetching. */
export const WEATHER_FRESH_MS = 2 * 3600_000;
/** Older forecasts are shown as stale; beyond this they are ignored for scoring. */
export const WEATHER_MAX_AGE_MS = 36 * 3600_000;

export function cacheKey(latDeg: number, lonDeg: number): string {
  return `om:${roundCoord(latDeg).toFixed(2)},${roundCoord(lonDeg).toFixed(2)}`;
}

export type WeatherStatusKind = 'fresh' | 'stale' | 'offline-cached' | 'unavailable';

export interface WeatherResult {
  forecast: Forecast | null;
  status: WeatherStatusKind;
  error?: string;
}

export async function getCachedForecast(latDeg: number, lonDeg: number): Promise<Forecast | null> {
  const rec = await dataDb().weatherCache.get(cacheKey(latDeg, lonDeg));
  return (rec?.payload as Forecast | undefined) ?? null;
}

export async function getWeather(
  latDeg: number,
  lonDeg: number,
  opts: { force?: boolean; signal?: AbortSignal; fetcher?: typeof fetch; now?: number } = {},
): Promise<WeatherResult> {
  const now = opts.now ?? Date.now();
  const cached = await getCachedForecast(latDeg, lonDeg);
  if (!opts.force && cached && now - cached.fetchedAt < WEATHER_FRESH_MS) {
    return { forecast: cached, status: 'fresh' };
  }
  try {
    const f = await fetchOpenMeteo(latDeg, lonDeg, opts.signal, opts.fetcher);
    await dataDb().weatherCache.put({
      key: cacheKey(latDeg, lonDeg),
      latDeg: roundCoord(latDeg),
      lonDeg: roundCoord(lonDeg),
      fetchedAt: f.fetchedAt,
      payload: f,
    });
    return { forecast: f, status: 'fresh' };
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    if (cached && now - cached.fetchedAt < WEATHER_MAX_AGE_MS) {
      return { forecast: cached, status: 'offline-cached', error: msg };
    }
    return { forecast: null, status: 'unavailable', error: msg };
  }
}

export function scoreForecast(f: Forecast | null): HourlyWeatherScore[] | null {
  if (!f) return null;
  return f.hourly.map(scoreHour);
}

export async function clearWeatherCache() {
  await dataDb().weatherCache.clear();
}
