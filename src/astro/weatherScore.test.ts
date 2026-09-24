import { describe, expect, it } from 'vitest';
import {
  bestWeatherWindow,
  clarityScore,
  cloudCap,
  cloudScore,
  dewScore,
  effectiveCloud,
  effectiveWind,
  humidityWarning,
  precipitationScore,
  scoreHour,
  sessionWeather,
  weatherLabel,
  windScore,
} from './weatherScore';
import type { HourlyWeather } from './weatherScore';

const clear: HourlyWeather = {
  timeMs: 0,
  cloudTotal: 0,
  cloudLow: 0,
  cloudMid: 0,
  cloudHigh: 0,
  temperatureC: 15,
  humidityPct: 50,
  dewPointC: 5,
  precipProbabilityPct: 0,
  precipMm: 0,
  visibilityM: 40000,
  windKmh: 3,
  gustKmh: 5,
  weatherCode: 0,
};

describe('cloud', () => {
  it('computes effective cloud cover', () => {
    expect(effectiveCloud({ cloudTotal: 20, cloudLow: 10, cloudMid: 30, cloudHigh: 50 })).toBe(40);
    expect(effectiveCloud({ cloudTotal: 20, cloudLow: 60, cloudMid: 0, cloudHigh: 0 })).toBe(60);
    expect(
      effectiveCloud({ cloudTotal: null, cloudLow: null, cloudMid: null, cloudHigh: null }),
    ).toBeNull();
  });
  it.each([
    [0, 100],
    [10, 100],
    [10.1, 90],
    [20, 90],
    [20.1, 70],
    [35, 70],
    [35.1, 50],
    [50, 50],
    [50.1, 25],
    [70, 25],
    [70.1, 10],
    [85, 10],
    [85.1, 0],
    [100, 0],
  ])('cloud %s%% → %s', (c, s) => expect(cloudScore(c)).toBe(s));
});

describe('dew', () => {
  it.each([
    [10, 100],
    [6, 100],
    [5.9, 90],
    [4, 90],
    [3.9, 75],
    [3, 75],
    [2.9, 55],
    [2, 55],
    [1.9, 30],
    [1, 30],
    [0.9, 10],
    [0.1, 10],
    [0, 0],
    [-1, 0],
  ])('spread %s°C → %s', (d, s) => expect(dewScore(d)).toBe(s));
  it('warns on humidity', () => {
    expect(humidityWarning(89)).toBe('none');
    expect(humidityWarning(90)).toBe('warning');
    expect(humidityWarning(95)).toBe('strong');
    expect(humidityWarning(null)).toBe('none');
  });
});

describe('wind', () => {
  it('uses max(speed, 0.6·gust)', () => {
    expect(effectiveWind(10, 30)).toBe(18);
    expect(effectiveWind(20, 10)).toBe(20);
    expect(effectiveWind(null, null)).toBeNull();
  });
  it.each([
    [0, 100],
    [8, 100],
    [8.1, 90],
    [12, 90],
    [12.1, 70],
    [18, 70],
    [18.1, 40],
    [25, 40],
    [25.1, 15],
    [35, 15],
    [35.1, 0],
  ])('wind %s km/h → %s', (w, s) => expect(windScore(w)).toBe(s));
});

describe('atmospheric clarity estimate (not seeing)', () => {
  it.each([
    [50, 100],
    [25, 100],
    [24.9, 85],
    [15, 85],
    [14.9, 65],
    [10, 65],
    [9.9, 35],
    [5, 35],
    [4.9, 10],
  ])('visibility %s km → %s', (v, s) => expect(clarityScore(v)).toBe(s));
});

describe('precipitation probability', () => {
  it.each([
    [0, 100],
    [9.9, 100],
    [10, 80],
    [19.9, 80],
    [20, 50],
    [39.9, 50],
    [40, 20],
    [69.9, 20],
    [70, 0],
    [100, 0],
  ])('%s%% → %s', (p, s) => expect(precipitationScore(p)).toBe(s));
});

describe('hourly score', () => {
  it('perfect conditions score 100', () => {
    const h = scoreHour(clear);
    expect(h.score).toBe(100);
    expect(h.label).toBe('very-good');
    expect(h.partial).toBe(false);
  });
  it('applies the documented weights', () => {
    // cloud 25 (Ceff 60) · 0.45 + dew 100·0.2 + wind 100·0.15 + clarity 100·0.1 + precip 100·0.1 = 66.25, cap 36.25
    const h = scoreHour({ ...clear, cloudTotal: 60 });
    expect(h.components.cloud).toBe(25);
    expect(h.score).toBeCloseTo(cloudCap(25), 6);
    // Clear sky, dew spread 2.5 (55), wind 20 (40): 45 + 11 + 6 + 10 + 10 = 82
    const h2 = scoreHour({ ...clear, dewPointC: 12.5, windKmh: 20, gustKmh: 20 });
    expect(h2.score).toBeCloseTo(82, 6);
    expect(h2.label).toBe('good');
  });
  it('renormalises when fields are missing', () => {
    const h = scoreHour({ ...clear, visibilityM: null });
    expect(h.partial).toBe(true);
    expect(h.score).toBe(100);
  });
  it('hard-stops on precipitation, severe weather and dangerous gusts', () => {
    expect(scoreHour({ ...clear, precipMm: 0.5 }).hardStop).toBe('precipitation');
    expect(scoreHour({ ...clear, weatherCode: 63 }).hardStop).toBe('precipitation');
    expect(scoreHour({ ...clear, weatherCode: 95 }).hardStop).toBe('severe');
    expect(scoreHour({ ...clear, gustKmh: 70 }).hardStop).toBe('gusts');
    expect(scoreHour({ ...clear, precipMm: 0.5 }).score).toBe(0);
    expect(scoreHour({ ...clear, precipMm: 0.1 }).hardStop).toBeNull();
  });
  it('labels', () => {
    expect(weatherLabel(85)).toBe('very-good');
    expect(weatherLabel(70)).toBe('good');
    expect(weatherLabel(50)).toBe('marginal');
    expect(weatherLabel(30)).toBe('poor');
    expect(weatherLabel(29.9)).toBe('unsuitable');
  });
});

describe('session weather', () => {
  it('combines 0.7 average + 0.3 worst', () => {
    const hours = [100, 100, 40].map((c, i) => ({
      ...scoreHour({ ...clear, timeMs: i * 3600_000 }),
      score: c,
    }));
    const s = sessionWeather(hours)!;
    expect(s.average).toBeCloseTo(80, 6);
    expect(s.worst).toBe(40);
    expect(s.score).toBeCloseTo(0.7 * 80 + 0.3 * 40, 6);
  });
  it('detects increasing dew risk', () => {
    const hours = [5, 5, 1.5].map((spread, i) =>
      scoreHour({ ...clear, timeMs: i * 3600_000, dewPointC: 15 - spread }),
    );
    const s = sessionWeather(hours)!;
    expect(s.dewRiskFromMs).toBe(2 * 3600_000);
  });
  it('finds the best weather window', () => {
    const hours = [0, 20, 100, 100, 100, 30].map((c, i) => ({
      ...scoreHour({ ...clear, timeMs: i * 3600_000 }),
      score: c,
    }));
    const w = bestWeatherWindow(hours, 0, 6 * 3600_000, 3)!;
    expect(w.startMs).toBe(2 * 3600_000);
    expect(w.mean).toBe(100);
  });
  it('returns null without data', () => {
    expect(sessionWeather([])).toBeNull();
  });
});
