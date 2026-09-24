import { beforeEach, describe, expect, it } from 'vitest';
import { buildForecastUrl, parseOpenMeteo, roundCoord } from './openMeteo';
import { getWeather, scoreForecast } from './weatherService';
import { AstroDataDb, setDataDbForTests } from '../data/dataDb';

const sample = {
  latitude: 41.06,
  longitude: 29.06,
  hourly: {
    time: [1760000400, 1760004000],
    temperature_2m: [12.1, 11.4],
    relative_humidity_2m: [70, 93],
    dew_point_2m: [6.8, 10.3],
    precipitation_probability: [0, 5],
    precipitation: [0, 0],
    cloud_cover: [5, 60],
    cloud_cover_low: [0, 10],
    cloud_cover_mid: [0, 20],
    cloud_cover_high: [10, 70],
    visibility: [30000, null],
    wind_speed_10m: [5, 9],
    wind_gusts_10m: [10, 22],
    weather_code: [0, 3],
  },
};

describe('Open-Meteo adapter', () => {
  it('rounds coordinates before sending them (privacy)', () => {
    const url = buildForecastUrl(41.063456, 29.061234);
    expect(url).toContain('latitude=41.06');
    expect(url).toContain('longitude=29.06');
    expect(url).not.toContain('41.0634');
    expect(url).toContain('cloud_cover_low');
    expect(url).toContain('timeformat=unixtime');
    expect(roundCoord(41.066)).toBeCloseTo(41.07, 9);
  });
  it('parses hourly data with nulls', () => {
    const f = parseOpenMeteo(sample, 123);
    expect(f.hourly).toHaveLength(2);
    expect(f.hourly[0].timeMs).toBe(1760000400000);
    expect(f.hourly[1].visibilityM).toBeNull();
    expect(f.forecastEndMs).toBe(1760004000000);
    const scores = scoreForecast(f)!;
    expect(scores[0].score).toBeGreaterThan(90);
    expect(scores[1].humidity).toBe('warning');
    expect(scores[1].partial).toBe(true);
  });
  it('rejects payloads without hourly data', () => {
    expect(() => parseOpenMeteo({})).toThrow();
  });
});

describe('weather service fallback', () => {
  beforeEach(() => setDataDbForTests(new AstroDataDb(`w-${Math.random()}`)));
  const ok = (async () => new Response(JSON.stringify(sample))) as unknown as typeof fetch;
  const fail = (async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;

  it('fetches and caches', async () => {
    const r = await getWeather(41.06, 29.06, { fetcher: ok, now: 1_000_000 });
    expect(r.status).toBe('fresh');
    const again = await getWeather(41.06, 29.06, { fetcher: fail, now: Date.now() });
    expect(again.forecast).not.toBeNull();
  });
  it('degrades gracefully when offline with no cache', async () => {
    const r = await getWeather(10, 10, { fetcher: fail });
    expect(r.status).toBe('unavailable');
    expect(r.forecast).toBeNull();
    expect(r.error).toMatch(/fetch/);
  });
  it('uses a stale cache when the network fails', async () => {
    await getWeather(41.06, 29.06, { fetcher: ok });
    const r = await getWeather(41.06, 29.06, { fetcher: fail, force: true });
    expect(r.status).toBe('offline-cached');
  });
});
