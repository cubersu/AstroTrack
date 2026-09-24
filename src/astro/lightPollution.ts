/**
 * Light-pollution model.
 *
 * The engine works with the zenith sky brightness in V mag/arcsec² ("SQM
 * value"). The Bortle class is only a coarse, visually defined scale; its
 * mapping to SQM below is the commonly used approximate correspondence
 * (see docs/scoring.md) and is NOT a measurement.
 *
 * Priority of sources (highest first):
 *   1. user-entered SQM reading (measured)
 *   2. user-entered Bortle class (manual estimate)
 *   3. light-pollution atlas estimate from VIIRS-derived data packs (estimate)
 *   4. unknown → explicit assumption (Bortle 5 / 20.0) with lowered confidence
 */
import type { SpectralClass } from './objectTypes';
import { clamp } from './units';

/** Natural (pristine) zenith sky brightness, V mag/arcsec². */
export const PRISTINE_SKY_SQM = 22.0;
/** Reference sky for the integration-time baseline (Bortle 4). */
export const REFERENCE_SKY_SQM = 21.1;
/** Assumption used when nothing is known about the site. */
export const UNKNOWN_SITE_SQM = 20.0;

/** Representative SQM for each Bortle class (approximate). */
export const BORTLE_TO_SQM: Record<number, number> = {
  1: 22.0,
  2: 21.9,
  3: 21.75,
  4: 21.1,
  5: 20.0,
  6: 19.2,
  7: 18.65,
  8: 18.1,
  9: 17.5,
};

/** Lower SQM bound of each Bortle class (approximate, commonly cited ranges). */
const BORTLE_THRESHOLDS: Array<[number, number]> = [
  [21.99, 1],
  [21.89, 2],
  [21.69, 3],
  [20.49, 4],
  [19.5, 5],
  [18.94, 6],
  [18.38, 7],
  [17.8, 8],
];

export function bortleToSqm(bortle: number): number {
  const b = clamp(Math.round(bortle), 1, 9);
  return BORTLE_TO_SQM[b];
}

export function sqmToBortle(sqm: number): number {
  for (const [lo, cls] of BORTLE_THRESHOLDS) if (sqm >= lo) return cls;
  return 9;
}

export type SkySource = 'sqm-manual' | 'bortle-manual' | 'atlas-estimate' | 'assumed';

export interface SiteSky {
  sqm: number;
  bortle: number;
  source: SkySource;
}

export interface SiteSkyInput {
  sqmManual?: number | null;
  bortleManual?: number | null;
  atlasSqm?: number | null;
}

/** Resolve the effective site sky brightness following the documented priority. */
export function resolveSiteSky(input: SiteSkyInput): SiteSky {
  if (input.sqmManual != null && Number.isFinite(input.sqmManual)) {
    return { sqm: input.sqmManual, bortle: sqmToBortle(input.sqmManual), source: 'sqm-manual' };
  }
  if (input.bortleManual != null && Number.isFinite(input.bortleManual)) {
    const b = clamp(Math.round(input.bortleManual), 1, 9);
    return { sqm: bortleToSqm(b), bortle: b, source: 'bortle-manual' };
  }
  if (input.atlasSqm != null && Number.isFinite(input.atlasSqm)) {
    return { sqm: input.atlasSqm, bortle: sqmToBortle(input.atlasSqm), source: 'atlas-estimate' };
  }
  return { sqm: UNKNOWN_SITE_SQM, bortle: sqmToBortle(UNKNOWN_SITE_SQM), source: 'assumed' };
}

/**
 * Filter transmission model: fraction of the target signal and of the sky
 * background (continuum + artificial lines) passed by a filter, per spectral
 * class of target. Approximate engineering assumptions — documented in
 * docs/scoring.md. Sky transmission of LP filters depends heavily on the
 * lighting mix (sodium vs. LED); these values assume a mixed, LED-heavy sky.
 */
export type FilterKind =
  'none' | 'uv-ir-cut' | 'broadband-lp' | 'cls-uhc' | 'dual-band' | 'narrowband' | 'custom';

export interface Transmission {
  signal: number;
  sky: number;
}

export const FILTER_TRANSMISSION: Record<
  Exclude<FilterKind, 'custom'>,
  Record<SpectralClass, Transmission>
> = {
  none: {
    broadband: { signal: 1, sky: 1 },
    stellar: { signal: 1, sky: 1 },
    emission: { signal: 1, sky: 1 },
    mixed: { signal: 1, sky: 1 },
    absorption: { signal: 1, sky: 1 },
  },
  'uv-ir-cut': {
    broadband: { signal: 0.97, sky: 0.95 },
    stellar: { signal: 0.97, sky: 0.95 },
    emission: { signal: 0.97, sky: 0.95 },
    mixed: { signal: 0.97, sky: 0.95 },
    absorption: { signal: 0.97, sky: 0.95 },
  },
  'broadband-lp': {
    broadband: { signal: 0.75, sky: 0.55 },
    stellar: { signal: 0.75, sky: 0.55 },
    emission: { signal: 0.9, sky: 0.55 },
    mixed: { signal: 0.82, sky: 0.55 },
    absorption: { signal: 0.75, sky: 0.55 },
  },
  'cls-uhc': {
    broadband: { signal: 0.45, sky: 0.3 },
    stellar: { signal: 0.45, sky: 0.3 },
    emission: { signal: 0.85, sky: 0.3 },
    mixed: { signal: 0.65, sky: 0.3 },
    absorption: { signal: 0.45, sky: 0.3 },
  },
  'dual-band': {
    broadband: { signal: 0.05, sky: 0.05 },
    stellar: { signal: 0.06, sky: 0.05 },
    emission: { signal: 0.6, sky: 0.05 },
    mixed: { signal: 0.35, sky: 0.05 },
    absorption: { signal: 0.05, sky: 0.05 },
  },
  narrowband: {
    broadband: { signal: 0.02, sky: 0.02 },
    stellar: { signal: 0.03, sky: 0.02 },
    emission: { signal: 0.35, sky: 0.02 },
    mixed: { signal: 0.2, sky: 0.02 },
    absorption: { signal: 0.02, sky: 0.02 },
  },
};

/** Principal nebular emission lines (nm) used to evaluate custom filter passbands. */
export const EMISSION_LINES_NM = [486.1, 500.7, 656.3, 658.4, 671.6, 673.1];

export interface FilterBand {
  centerNm: number;
  bandwidthNm: number;
}

/**
 * Transmission for a custom filter described by passbands. The sky fraction
 * is approximated by total bandwidth over a ~300 nm visible continuum; the
 * emission-line signal fraction by whether principal lines fall inside.
 * Without band metadata a custom filter is treated as neutral (and the
 * caller lowers confidence).
 */
export function customFilterTransmission(
  bands: FilterBand[] | undefined,
  spectral: SpectralClass,
): Transmission & { known: boolean } {
  if (!bands || bands.length === 0) return { signal: 1, sky: 1, known: false };
  const total = bands.reduce((s, b) => s + Math.max(0, b.bandwidthNm), 0);
  const sky = clamp(total / 300, 0.01, 1);
  const linesIn = EMISSION_LINES_NM.filter((l) =>
    bands.some((b) => Math.abs(l - b.centerNm) <= b.bandwidthNm / 2),
  ).length;
  const hasHaOrOiii = bands.some(
    (b) =>
      Math.abs(656.3 - b.centerNm) <= b.bandwidthNm / 2 ||
      Math.abs(500.7 - b.centerNm) <= b.bandwidthNm / 2,
  );
  let signal: number;
  switch (spectral) {
    case 'emission':
      signal = hasHaOrOiii ? clamp(0.3 + 0.1 * linesIn, 0.3, 0.9) : 0.1;
      break;
    case 'mixed':
      signal = hasHaOrOiii ? clamp(0.2 + 0.08 * linesIn + sky * 0.5, 0.2, 0.9) : sky;
      break;
    default:
      signal = sky;
  }
  return { signal: Math.min(signal, 1), sky, known: true };
}

/**
 * Physical sky-limited degradation factor: the ratio of integration time
 * needed for equal signal-to-noise under sky background `bSite` versus a
 * reference background `bRef`, for a target of surface flux `s` (all in the
 * same linear units), with filter transmissions applied:
 *
 *   G = (τ_sky·B_site + τ_sig·S) / (τ_sky·B_ref + τ_sig·S)
 *
 * Derivation: per-pixel SNR in the background-limited regime is
 * S·t / sqrt((S + B)·t); for equal SNR, t ∝ (S + B) / S².
 */
export function backgroundDegradation(
  bSite: number,
  bRef: number,
  s: number,
  tr: Transmission = { signal: 1, sky: 1 },
): number {
  const num = tr.sky * bSite + tr.signal * s;
  const den = tr.sky * bRef + tr.signal * s;
  return den > 0 ? num / den : Number.POSITIVE_INFINITY;
}

/** Map a degradation factor (≥1) to a 0–100 score with a type-specific exponent. */
export function degradationScore(factor: number, exponent: number): number {
  if (!(factor > 0) || !Number.isFinite(factor)) return 0;
  return clamp(100 * Math.pow(Math.max(factor, 1), -exponent), 0, 100);
}
