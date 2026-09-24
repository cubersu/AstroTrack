/**
 * Hourly Weather Score (Section 11) — deliberately separate from the Astro Score.
 *
 *   WeatherScore = cloud·0.45 + dew·0.20 + wind·0.15 + clarity·0.10 + precipitation·0.10
 *
 * Effective cloud Ceff = max(total, low, 0.9·mid, 0.8·high); effective wind
 * = max(speed, 0.6·gust). "Clarity" is an Atmospheric Clarity Estimate derived
 * from meteorological visibility (haze) — it is NOT astronomical seeing and no
 * arcsecond seeing value is ever produced.
 *
 * Missing inputs are skipped and the remaining weights renormalised; the
 * result is flagged `partial`.
 */

export interface HourlyWeather {
  timeMs: number;
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  dewPointC: number | null;
  precipProbabilityPct: number | null;
  precipMm: number | null;
  visibilityM: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  weatherCode: number | null;
}

export const WEATHER_WEIGHTS = {
  cloud: 0.45,
  dew: 0.2,
  wind: 0.15,
  clarity: 0.1,
  precipitation: 0.1,
} as const;

export type WeatherComponent = keyof typeof WEATHER_WEIGHTS;

/**
 * Cloud cap (documented addition to Section 11): because deep-sky imaging is
 * impossible through thick cloud however calm and dry the air is, the hourly
 * score may not exceed 15 + 0.85 × cloudScore. With a clear sky (cloud score
 * 100) the cap has no effect; under overcast (cloud score 0) the hour is
 * capped at 15 ("Unsuitable") instead of the 55 the weighted sum would give.
 */
export function cloudCap(cloud: number): number {
  return 15 + 0.85 * cloud;
}

/** Precipitation amount (mm/h) considered "meaningful actual precipitation". */
export const HARD_STOP_PRECIP_MM = 0.2;
/** Gust speed (km/h) considered unsafe for equipment. */
export const HARD_STOP_GUST_KMH = 60;

export function effectiveCloud(
  h: Pick<HourlyWeather, 'cloudTotal' | 'cloudLow' | 'cloudMid' | 'cloudHigh'>,
): number | null {
  const vals: number[] = [];
  if (h.cloudTotal != null) vals.push(h.cloudTotal);
  if (h.cloudLow != null) vals.push(h.cloudLow);
  if (h.cloudMid != null) vals.push(0.9 * h.cloudMid);
  if (h.cloudHigh != null) vals.push(0.8 * h.cloudHigh);
  return vals.length ? Math.max(...vals) : null;
}

export function cloudScore(ceffPct: number): number {
  if (ceffPct <= 10) return 100;
  if (ceffPct <= 20) return 90;
  if (ceffPct <= 35) return 70;
  if (ceffPct <= 50) return 50;
  if (ceffPct <= 70) return 25;
  if (ceffPct <= 85) return 10;
  return 0;
}

/** Dew risk from the temperature–dew-point spread (°C). */
export function dewScore(spreadC: number): number {
  if (spreadC >= 6) return 100;
  if (spreadC >= 4) return 90;
  if (spreadC >= 3) return 75;
  if (spreadC >= 2) return 55;
  if (spreadC >= 1) return 30;
  if (spreadC > 0) return 10;
  return 0;
}

export type HumidityWarning = 'none' | 'warning' | 'strong';

export function humidityWarning(rhPct: number | null): HumidityWarning {
  if (rhPct == null) return 'none';
  if (rhPct >= 95) return 'strong';
  if (rhPct >= 90) return 'warning';
  return 'none';
}

export function effectiveWind(speedKmh: number | null, gustKmh: number | null): number | null {
  if (speedKmh == null && gustKmh == null) return null;
  return Math.max(speedKmh ?? 0, 0.6 * (gustKmh ?? 0));
}

export function windScore(effKmh: number): number {
  if (effKmh <= 8) return 100;
  if (effKmh <= 12) return 90;
  if (effKmh <= 18) return 70;
  if (effKmh <= 25) return 40;
  if (effKmh <= 35) return 15;
  return 0;
}

/** Atmospheric Clarity Estimate from meteorological visibility (km). */
export function clarityScore(visibilityKm: number): number {
  if (visibilityKm >= 25) return 100;
  if (visibilityKm >= 15) return 85;
  if (visibilityKm >= 10) return 65;
  if (visibilityKm >= 5) return 35;
  return 10;
}

export function precipitationScore(probPct: number): number {
  if (probPct < 10) return 100;
  if (probPct < 20) return 80;
  if (probPct < 40) return 50;
  if (probPct < 70) return 20;
  return 0;
}

/** WMO weather codes treated as precipitation (rain, snow, showers) or severe (thunderstorm). */
export function isPrecipitationCode(code: number | null): boolean {
  if (code == null) return false;
  return (code >= 61 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86);
}
export function isSevereCode(code: number | null): boolean {
  return code != null && code >= 95;
}

export type HardStopReason = 'precipitation' | 'severe' | 'gusts';

export interface HourlyWeatherScore {
  timeMs: number;
  score: number;
  label: WeatherLabel;
  components: Partial<Record<WeatherComponent, number>>;
  partial: boolean;
  hardStop: HardStopReason | null;
  humidity: HumidityWarning;
  ceff: number | null;
  dewSpreadC: number | null;
  windEff: number | null;
}

export type WeatherLabel = 'very-good' | 'good' | 'marginal' | 'poor' | 'unsuitable';

export function weatherLabel(score: number): WeatherLabel {
  if (score >= 85) return 'very-good';
  if (score >= 70) return 'good';
  if (score >= 50) return 'marginal';
  if (score >= 30) return 'poor';
  return 'unsuitable';
}

export function scoreHour(h: HourlyWeather): HourlyWeatherScore {
  const comps: Partial<Record<WeatherComponent, number>> = {};
  const ceff = effectiveCloud(h);
  if (ceff != null) comps.cloud = cloudScore(ceff);
  const spread =
    h.temperatureC != null && h.dewPointC != null ? h.temperatureC - h.dewPointC : null;
  if (spread != null) comps.dew = dewScore(spread);
  const wEff = effectiveWind(h.windKmh, h.gustKmh);
  if (wEff != null) comps.wind = windScore(wEff);
  if (h.visibilityM != null) comps.clarity = clarityScore(h.visibilityM / 1000);
  if (h.precipProbabilityPct != null)
    comps.precipitation = precipitationScore(h.precipProbabilityPct);

  let wsum = 0;
  let total = 0;
  for (const k of Object.keys(WEATHER_WEIGHTS) as WeatherComponent[]) {
    const v = comps[k];
    if (v != null) {
      total += v * WEATHER_WEIGHTS[k];
      wsum += WEATHER_WEIGHTS[k];
    }
  }
  let score = wsum > 0 ? total / wsum : 0;
  if (comps.cloud != null) score = Math.min(score, cloudCap(comps.cloud));
  let hardStop: HardStopReason | null = null;
  if (isSevereCode(h.weatherCode)) hardStop = 'severe';
  else if (
    (h.precipMm != null && h.precipMm >= HARD_STOP_PRECIP_MM) ||
    isPrecipitationCode(h.weatherCode)
  )
    hardStop = 'precipitation';
  else if (h.gustKmh != null && h.gustKmh >= HARD_STOP_GUST_KMH) hardStop = 'gusts';
  if (hardStop) score = 0;
  return {
    timeMs: h.timeMs,
    score,
    label: weatherLabel(score),
    components: comps,
    partial: wsum < 0.999,
    hardStop,
    humidity: humidityWarning(h.humidityPct),
    ceff,
    dewSpreadC: spread,
    windEff: wEff,
  };
}

export interface SessionWeather {
  score: number;
  average: number;
  worst: number;
  label: WeatherLabel;
  hardStop: HardStopReason | null;
  hours: HourlyWeatherScore[];
  /** First hour (ms) at which dew risk becomes high (dew score ≤ 55), if any. */
  dewRiskFromMs: number | null;
  humidity: HumidityWarning;
}

/** SessionWeather = 0.70 · average + 0.30 · worst (Section 11). */
export function sessionWeather(hours: HourlyWeatherScore[]): SessionWeather | null {
  if (hours.length === 0) return null;
  const avg = hours.reduce((s, h) => s + h.score, 0) / hours.length;
  const worst = Math.min(...hours.map((h) => h.score));
  const hard = hours.find((h) => h.hardStop)?.hardStop ?? null;
  const score = hard ? 0 : 0.7 * avg + 0.3 * worst;
  const dew = hours.find((h) => h.components.dew != null && h.components.dew <= 55);
  const hum: HumidityWarning = hours.some((h) => h.humidity === 'strong')
    ? 'strong'
    : hours.some((h) => h.humidity === 'warning')
      ? 'warning'
      : 'none';
  return {
    score,
    average: avg,
    worst,
    label: weatherLabel(score),
    hardStop: hard,
    hours,
    dewRiskFromMs: dew ? dew.timeMs : null,
    humidity: hum,
  };
}

/**
 * Best contiguous weather window of `lengthH` hours within [startMs, endMs]
 * by mean hourly score. Returns null when no hourly data covers the range.
 */
export function bestWeatherWindow(
  hours: HourlyWeatherScore[],
  startMs: number,
  endMs: number,
  lengthH: number,
): { startMs: number; endMs: number; mean: number } | null {
  const inRange = hours.filter((h) => h.timeMs >= startMs - 1800_000 && h.timeMs <= endMs);
  if (inRange.length === 0) return null;
  const len = Math.max(1, Math.min(inRange.length, Math.round(lengthH)));
  let best: { startMs: number; endMs: number; mean: number } | null = null;
  for (let i = 0; i + len <= inRange.length; i++) {
    const slice = inRange.slice(i, i + len);
    const mean = slice.reduce((s, h) => s + h.score, 0) / len;
    if (!best || mean > best.mean) {
      best = { startMs: slice[0].timeMs, endMs: slice[len - 1].timeMs + 3600_000, mean };
    }
  }
  return best;
}
