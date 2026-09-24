/**
 * Centralised, documented scoring configuration. Every tunable number used by
 * the Astro Score, Weather Score and Tonight Score lives here (see
 * docs/scoring.md). Users may only adjust *preferences* (thresholds and
 * tolerances) via ScoringSettings — never the underlying astronomy.
 */
import type { FramingStyle } from './framing';
import type { TrailingTolerance } from './npf';

export const ASTRO_WEIGHTS = {
  altitude: 0.2,
  framing: 0.2,
  moon: 0.15,
  lightPollution: 0.15,
  accessibility: 0.1,
  duration: 0.1,
  cameraFilter: 0.05,
  trackingExposure: 0.05,
} as const;

export type AstroComponent = keyof typeof ASTRO_WEIGHTS;

export const ASTRO_COMPONENTS = Object.keys(ASTRO_WEIGHTS) as AstroComponent[];

export type ScoreClass = 'recommended' | 'worth-trying' | 'difficult' | 'unsuitable';

export interface ClassThresholds {
  recommended: number;
  worthTrying: number;
  difficult: number;
}

export const DEFAULT_CLASS_THRESHOLDS: ClassThresholds = {
  recommended: 80,
  worthTrying: 60,
  difficult: 40,
};

export function classifyScore(
  score: number,
  t: ClassThresholds = DEFAULT_CLASS_THRESHOLDS,
): ScoreClass {
  if (score >= t.recommended) return 'recommended';
  if (score >= t.worthTrying) return 'worth-trying';
  if (score >= t.difficult) return 'difficult';
  return 'unsuitable';
}

/** Cap applied to the numeric score when a non-visibility hard constraint fires. */
export const HARD_CONSTRAINT_CAP = 39;

/** Usable astronomical duration (hours above min altitude in darkness) → score. */
export const DURATION_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.5, 10],
  [1, 25],
  [2, 50],
  [3, 70],
  [4, 85],
  [6, 100],
];

/** Mean V surface brightness (mag/arcsec²) → photographic accessibility score. */
export const ACCESSIBILITY_SB_TABLE: ReadonlyArray<readonly [number, number]> = [
  [17, 100],
  [19, 95],
  [20, 88],
  [21, 78],
  [22, 62],
  [23, 42],
  [24, 25],
  [25, 12],
];

/** Integrated V magnitude → accessibility for star clusters / clouds. */
export const ACCESSIBILITY_MAG_TABLE: ReadonlyArray<readonly [number, number]> = [
  [3, 100],
  [5, 95],
  [7, 85],
  [9, 65],
  [11, 40],
  [13, 20],
  [15, 8],
];

/** Accessibility for dark nebulae (contrast depends on the star field; no photometry). */
export const DARK_NEBULA_ACCESSIBILITY = 40;
/** Accessibility when nothing is known photometrically. */
export const UNKNOWN_ACCESSIBILITY = 50;

/** Achievable sub / desired sub → tracking/exposure compatibility score. */
export const TRACKING_RATIO_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.02, 10],
  [0.05, 25],
  [0.1, 40],
  [0.25, 60],
  [0.5, 80],
  [1, 100],
];

/** Weather Score → Tonight multiplier (Section 19). */
export const WEATHER_MULTIPLIER_TABLE: ReadonlyArray<{ min: number; multiplier: number }> = [
  { min: 90, multiplier: 1.0 },
  { min: 80, multiplier: 0.95 },
  { min: 70, multiplier: 0.88 },
  { min: 60, multiplier: 0.78 },
  { min: 50, multiplier: 0.65 },
  { min: 40, multiplier: 0.5 },
  { min: 30, multiplier: 0.35 },
  { min: -Infinity, multiplier: 0.15 },
];

/** available / recommended integration → Tonight multiplier. */
export const TIME_MULTIPLIER_TABLE: ReadonlyArray<{ min: number; multiplier: number }> = [
  { min: 1.0, multiplier: 1.0 },
  { min: 0.75, multiplier: 0.95 },
  { min: 0.5, multiplier: 0.85 },
  { min: 0.25, multiplier: 0.65 },
  { min: -Infinity, multiplier: 0.4 },
];

/** Confidence penalty points (start at 100). ≥80 High, 50–79 Medium, <50 Low. */
export const CONFIDENCE_PENALTIES = {
  sizeMissing: 40,
  sbAssumed: 25,
  sbDerived: 10,
  magnitudeMissing: 10,
  skyAssumed: 20,
  skyAtlasEstimate: 5,
  trackingUncalibrated: 10,
  trackingExtrapolatedFar: 10,
  customFilterUnknown: 10,
  moonVeryClose: 10,
  apertureUnknown: 15,
} as const;

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export function confidenceLevel(points: number): ConfidenceLevel {
  if (points >= 80) return 'high';
  if (points >= 50) return 'medium';
  return 'low';
}

export type MoonTolerance = 'strict' | 'normal' | 'relaxed';
export const MOON_TOLERANCE_FACTOR: Record<MoonTolerance, number> = {
  strict: 1.3,
  normal: 1.0,
  relaxed: 0.7,
};

export type WeatherSensitivity = 'strict' | 'normal' | 'relaxed';
/** Scales the shortfall (100 − score) before the multiplier lookup. */
export const WEATHER_SENSITIVITY_FACTOR: Record<WeatherSensitivity, number> = {
  strict: 1.25,
  normal: 1.0,
  relaxed: 0.8,
};

/** User-adjustable preferences (advanced settings). */
export interface ScoringSettings {
  minAltitudeDeg: number;
  preferredAltitudeDeg: number;
  moonTolerance: MoonTolerance;
  /** Minimum fraction of the frame a target must span (0.015 = 1.5%). */
  minFrameFill: number;
  minTargetPx: number;
  framingStyle: FramingStyle;
  trailingTolerance: TrailingTolerance;
  weatherSensitivity: WeatherSensitivity;
  classThresholds: ClassThresholds;
  /** Atmospheric extinction coefficient used by the Moon model (mag/airmass). */
  extinctionK: number;
}

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  minAltitudeDeg: 25,
  preferredAltitudeDeg: 45,
  moonTolerance: 'normal',
  minFrameFill: 0.015,
  minTargetPx: 20,
  framingStyle: 'balanced',
  trailingTolerance: 'balanced',
  weatherSensitivity: 'normal',
  classThresholds: DEFAULT_CLASS_THRESHOLDS,
  extinctionK: 0.25,
};

/** Validation ranges for advanced settings (prevents invalidating the model). */
export const SETTINGS_LIMITS = {
  minAltitudeDeg: [5, 60],
  preferredAltitudeDeg: [20, 80],
  minFrameFill: [0.002, 0.2],
  minTargetPx: [5, 200],
  extinctionK: [0.1, 0.6],
} as const;

export function sanitizeSettings(s: Partial<ScoringSettings>): ScoringSettings {
  const d = DEFAULT_SCORING_SETTINGS;
  const within = (v: number | undefined, [lo, hi]: readonly [number, number], def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : def;
  const minAlt = within(s.minAltitudeDeg, SETTINGS_LIMITS.minAltitudeDeg, d.minAltitudeDeg);
  const prefAlt = Math.max(
    within(s.preferredAltitudeDeg, SETTINGS_LIMITS.preferredAltitudeDeg, d.preferredAltitudeDeg),
    minAlt + 5,
  );
  const ct = s.classThresholds ?? d.classThresholds;
  const thresholds: ClassThresholds =
    ct.recommended > ct.worthTrying &&
    ct.worthTrying > ct.difficult &&
    ct.difficult > 0 &&
    ct.recommended <= 100
      ? ct
      : d.classThresholds;
  return {
    minAltitudeDeg: minAlt,
    preferredAltitudeDeg: prefAlt,
    moonTolerance: s.moonTolerance ?? d.moonTolerance,
    minFrameFill: within(s.minFrameFill, SETTINGS_LIMITS.minFrameFill, d.minFrameFill),
    minTargetPx: within(s.minTargetPx, SETTINGS_LIMITS.minTargetPx, d.minTargetPx),
    framingStyle: s.framingStyle ?? d.framingStyle,
    trailingTolerance: s.trailingTolerance ?? d.trailingTolerance,
    weatherSensitivity: s.weatherSensitivity ?? d.weatherSensitivity,
    classThresholds: thresholds,
    extinctionK: within(s.extinctionK, SETTINGS_LIMITS.extinctionK, d.extinctionK),
  };
}

/**
 * Per-sample altitude quality (0–100) using the user's minimum and preferred
 * altitude: 0 below the minimum, 45 at the minimum, 88 at the preferred
 * altitude, 100 at ≥ 60° (air mass ≲ 1.15).
 */
export function altitudeQualityTable(s: ScoringSettings): Array<[number, number]> {
  const mid = (s.minAltitudeDeg + s.preferredAltitudeDeg) / 2;
  const top = Math.max(60, s.preferredAltitudeDeg + 5);
  return [
    [s.minAltitudeDeg, 45],
    [mid, 68],
    [s.preferredAltitudeDeg, 88],
    [top, 100],
  ];
}
