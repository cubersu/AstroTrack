/**
 * Open-Meteo forecast adapter (https://open-meteo.com — free, no API key,
 * CORS-enabled; data licensed CC BY 4.0, attribution required).
 *
 * Privacy: coordinates are rounded to 2 decimals (≈1 km) before being sent,
 * which is finer than the forecast models' grid, so accuracy is unaffected.
 * Requests are only made when the user has enabled weather.
 */
import type { HourlyWeather } from '../astro/weatherScore';

export const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
/** Days requested. Beyond ~7 days forecasts are not treated as known. */
export const FORECAST_DAYS = 7;

export const HOURLY_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation_probability',
  'precipitation',
  'cloud_cover',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'visibility',
  'wind_speed_10m',
  'wind_gusts_10m',
  'weather_code',
] as const;

export function roundCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

export function buildForecastUrl(latDeg: number, lonDeg: number, days = FORECAST_DAYS): string {
  const p = new URLSearchParams({
    latitude: roundCoord(latDeg).toFixed(2),
    longitude: roundCoord(lonDeg).toFixed(2),
    hourly: HOURLY_FIELDS.join(','),
    forecast_days: String(days),
    timezone: 'GMT',
    timeformat: 'unixtime',
    wind_speed_unit: 'kmh',
  });
  return `${OPEN_METEO_ENDPOINT}?${p.toString()}`;
}

export interface Forecast {
  source: 'open-meteo';
  fetchedAt: number;
  latDeg: number;
  lonDeg: number;
  hourly: HourlyWeather[];
  /** Last hour covered by the forecast (epoch ms). */
  forecastEndMs: number;
}

type Arr = Array<number | null> | undefined;

export class WeatherParseError extends Error {}

export function parseOpenMeteo(json: unknown, fetchedAt = Date.now()): Forecast {
  const j = json as {
    latitude?: number;
    longitude?: number;
    hourly?: Record<string, Arr> & { time?: number[] };
  };
  const h = j?.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0)
    throw new WeatherParseError('no hourly data');
  const get = (k: string, i: number): number | null => {
    const a = h[k] as Arr;
    const v = a?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const hourly: HourlyWeather[] = h.time.map((t, i) => ({
    timeMs: t * 1000,
    cloudTotal: get('cloud_cover', i),
    cloudLow: get('cloud_cover_low', i),
    cloudMid: get('cloud_cover_mid', i),
    cloudHigh: get('cloud_cover_high', i),
    temperatureC: get('temperature_2m', i),
    humidityPct: get('relative_humidity_2m', i),
    dewPointC: get('dew_point_2m', i),
    precipProbabilityPct: get('precipitation_probability', i),
    precipMm: get('precipitation', i),
    visibilityM: get('visibility', i),
    windKmh: get('wind_speed_10m', i),
    gustKmh: get('wind_gusts_10m', i),
    weatherCode: get('weather_code', i),
  }));
  return {
    source: 'open-meteo',
    fetchedAt,
    latDeg: j.latitude ?? Number.NaN,
    lonDeg: j.longitude ?? Number.NaN,
    hourly,
    forecastEndMs: hourly[hourly.length - 1].timeMs,
  };
}

export async function fetchOpenMeteo(
  latDeg: number,
  lonDeg: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Forecast> {
  const res = await fetcher(buildForecastUrl(latDeg, lonDeg), { signal });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return parseOpenMeteo(await res.json());
}
