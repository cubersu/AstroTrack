/**
 * Tonight Score = Astro Score × WeatherMultiplier × TimeMultiplier (Section 19).
 * Multiplicative so that terrible weather can never be averaged away.
 */
import type { ScoringSettings, WeatherSensitivity } from './config';
import {
  TIME_MULTIPLIER_TABLE,
  WEATHER_MULTIPLIER_TABLE,
  WEATHER_SENSITIVITY_FACTOR,
  classifyScore,
} from './config';
import type { DsoEvaluation } from './scoring';
import type { HourlyWeatherScore, SessionWeather } from './weatherScore';
import { sessionWeather } from './weatherScore';

export function weatherMultiplier(
  score: number,
  sensitivity: WeatherSensitivity = 'normal',
): number {
  const adjusted = 100 - (100 - score) * WEATHER_SENSITIVITY_FACTOR[sensitivity];
  for (const row of WEATHER_MULTIPLIER_TABLE) if (adjusted >= row.min) return row.multiplier;
  return WEATHER_MULTIPLIER_TABLE[WEATHER_MULTIPLIER_TABLE.length - 1].multiplier;
}

export function timeMultiplier(availableH: number, recommendedH: number): number {
  if (!(recommendedH > 0)) return 1;
  const r = availableH / recommendedH;
  for (const row of TIME_MULTIPLIER_TABLE) if (r >= row.min) return row.multiplier;
  return TIME_MULTIPLIER_TABLE[TIME_MULTIPLIER_TABLE.length - 1].multiplier;
}

export type WeatherStatus =
  'included' | 'unavailable' | 'beyond-forecast' | 'hard-stop' | 'disabled';

export interface TonightScore {
  score: number;
  astroScore: number;
  weatherMultiplier: number;
  timeMultiplier: number;
  weatherStatus: WeatherStatus;
  session: SessionWeather | null;
  /** Imaging hours available for this target (window ∩ user availability). */
  availableH: number;
  recommendedH: number;
  scoreClass: ReturnType<typeof classifyScore>;
}

/**
 * Combine an evaluation with (optional) hourly weather.
 * @param hourly hourly weather scores covering the night, or null when unavailable
 * @param forecastEndMs last instant covered by the forecast (to detect "beyond forecast")
 */
export function tonightScore(
  ev: DsoEvaluation,
  hourly: HourlyWeatherScore[] | null,
  settings: ScoringSettings,
  opts: { availableHours: number | null; weatherEnabled: boolean; forecastEndMs?: number | null },
): TonightScore {
  const recommendedH = ev.integration?.recommendedH ?? 0;
  const availableH = Math.min(opts.availableHours ?? ev.usableHours, ev.usableHours);
  const tMul = timeMultiplier(availableH, recommendedH);
  let wMul = 1;
  let status: WeatherStatus = 'unavailable';
  let session: SessionWeather | null = null;
  if (!opts.weatherEnabled) status = 'disabled';
  else if (hourly && ev.window) {
    const w = ev.window;
    if (opts.forecastEndMs != null && w.startMs > opts.forecastEndMs) {
      status = 'beyond-forecast';
    } else {
      const inWin = hourly.filter((h) => h.timeMs >= w.startMs - 1800_000 && h.timeMs < w.endMs);
      session = sessionWeather(inWin);
      if (session) {
        if (session.hardStop) {
          status = 'hard-stop';
          wMul = 0;
        } else {
          status = 'included';
          wMul = weatherMultiplier(session.score, settings.weatherSensitivity);
        }
      }
    }
  }
  const score = Math.round(ev.score * wMul * tMul);
  return {
    score,
    astroScore: ev.score,
    weatherMultiplier: wMul,
    timeMultiplier: tMul,
    weatherStatus: status,
    session,
    availableH,
    recommendedH,
    scoreClass: classifyScore(score, settings.classThresholds),
  };
}
