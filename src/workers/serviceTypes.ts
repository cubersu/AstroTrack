/** Request/response types shared by the catalogue worker and the UI. */
import type { ScoringSettings } from '../astro/config';
import type { GeoLocation } from '../astro/coordinates';
import type { MoonInfo } from '../astro/ephemeris';
import type { Reason } from '../astro/explain';
import type { SiteSky } from '../astro/lightPollution';
import type { DsoEvaluation, ExposureMode, RigInput, TimeMode } from '../astro/scoring';
import type { CalendarDate } from '../astro/time';
import type { TonightScore } from '../astro/tonight';
import type { NightInfo } from '../astro/twilight';
import type { HourlyWeatherScore } from '../astro/weatherScore';
import type { CatalogueFilter } from '../catalog/catalogStore';
import type { DsoDetail, DsoSummary } from '../catalog/types';

export interface CatalogueInfo {
  count: number;
  version: string;
  source: 'bundled' | 'installed';
  typeCounts: Record<string, number>;
}

export interface WeatherInput {
  hourly: HourlyWeatherScore[];
  forecastEndMs: number;
}

export interface NightRequest {
  location: GeoLocation;
  date: CalendarDate;
  rig: RigInput;
  sky: SiteSky;
  settings: ScoringSettings;
  exposureMode: ExposureMode;
  timeMode: TimeMode;
  nowMs?: number;
  availableHours: number | null;
  weather: WeatherInput | null;
  weatherEnabled: boolean;
  stepMinutes?: number;
}

export interface ScanRequest extends NightRequest {
  filter?: CatalogueFilter;
  limit: number;
  includeUnsuitable?: boolean;
  sortBy?: 'tonight' | 'astro';
}

export interface ScanItem {
  summary: DsoSummary;
  astroScore: number;
  tonight: Omit<TonightScore, 'session'> & { sessionScore: number | null };
  scoreClass: DsoEvaluation['scoreClass'];
  confidence: DsoEvaluation['confidence']['level'];
  hardConstraints: DsoEvaluation['hardConstraints'];
  insufficientData: boolean;
  opticsId: string | null;
  focalLengthMm: number | null;
  fNumber: number | null;
  fill: number | null;
  window: DsoEvaluation['window'];
  usableHours: number;
  recommendedH: number | null;
  maxAltDeg: number;
  moonSepDeg: number | null;
  reasons: Reason[];
}

export interface ScanResponse {
  night: NightInfo;
  moon: MoonInfo;
  total: number;
  evaluated: number;
  tookMs: number;
  items: ScanItem[];
}

export interface NightCurves {
  times: number[];
  sunAlt: number[];
  moonAlt: number[];
  dark: number[];
  targetAlt: number[];
}

export interface EvaluateRequest extends NightRequest {
  id: string;
}

export interface EvaluateResponse {
  summary: DsoSummary;
  evaluation: Omit<DsoEvaluation, 'visibility'> & {
    visibility: Omit<NonNullable<DsoEvaluation['visibility']>, 'curve'> | null;
  };
  tonight: TonightScore;
  night: NightInfo;
  moon: MoonInfo;
  curves: NightCurves;
}

export interface BrowseResponse {
  total: number;
  items: DsoSummary[];
}

export interface DetailResponse {
  summary: DsoSummary;
  detail: DsoDetail | null;
}

export interface StarFieldRequest {
  raDeg: number;
  decDeg: number;
  radiusDeg: number;
  magLimit: number;
  maxStars?: number;
}

export interface StarFieldResponse {
  ra: Float32Array;
  dec: Float32Array;
  mag: Float32Array;
  bv: Float32Array;
  labels: Array<{ ra: number; dec: number; label: string; mag: number }>;
  sources: string[];
  magLimitUsed: number;
}

export interface OpportunityRequest extends Omit<NightRequest, 'date' | 'timeMode' | 'nowMs'> {
  ids: string[];
  startDate: CalendarDate;
  days: number;
}

export interface OpportunityNight {
  date: CalendarDate;
  astroScore: number;
  tonightScore: number;
  weatherStatus: TonightScore['weatherStatus'];
  window: DsoEvaluation['window'];
  usableHours: number;
  moonIllumination: number;
}

export interface OpportunityTarget {
  summary: DsoSummary;
  nights: OpportunityNight[];
  best: OpportunityNight | null;
}

export interface OpportunityResponse {
  targets: OpportunityTarget[];
  tookMs: number;
}
