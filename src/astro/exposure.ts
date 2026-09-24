/**
 * Sub-exposure and ISO/gain guidance.
 *
 * Physically calculable part (when read noise is known): the sky-limited
 * sub-exposure at which sky shot noise dominates read noise,
 *
 *   t_sky = SWAMP · RN² / F_sky,   SWAMP = 10  (read noise adds ≲ 5% noise)
 *
 * with the sky electron rate per pixel
 *
 *   F_sky = Φ₀ · Δλ_eff · 10^(−0.4·SQM) · Ω_px · A · QE · T_opt · τ_sky
 *
 *   Φ₀   ≈ 1.0·10⁴ photons s⁻¹ cm⁻² nm⁻¹ for V = 0 (Bessell 1998, ≈1000 ph/s/cm²/Å)
 *   Δλ_eff ≈ 300 nm (mono, unfiltered) or ≈100 nm per Bayer pixel (colour)
 *   Ω_px = pixel scale² (arcsec²), A = π(D/2)² (cm²)
 *
 * Empirical part: without sensor noise data, sub-exposures and ISO are given
 * as ranges and labelled approximate; the exposure-calibration workflow then
 * refines them from the user's test frames.
 */
import type { CameraSpec } from './equipment';
import { cameraPixelPitchUm } from './equipment';
import { pixelScaleArcsec } from './pixelScale';
import { clamp } from './units';

export const PHOTON_FLUX_V0_PER_NM = 1.0e4;
export const SWAMP_FACTOR = 10;
export const DEFAULT_QE = 0.5;
export const DEFAULT_OPTICS_TRANSMISSION = 0.9;

export const NICE_EXPOSURES_S = [
  1, 2, 3, 4, 5, 6, 8, 10, 13, 15, 20, 25, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360,
  420, 480, 600, 900,
];

export function niceExposure(s: number): number {
  if (!(s > 0)) return 0;
  if (s < 1) return Math.max(0.1, Math.round(s * 10) / 10);
  let best = NICE_EXPOSURES_S[0];
  for (const v of NICE_EXPOSURES_S) if (v <= s * 1.0001) best = v;
  return best;
}

/** Sky background electron rate per pixel per second. */
export function skyElectronRate(opts: {
  sqm: number;
  focalMm: number;
  fNumber: number;
  pixelPitchUm: number;
  color: boolean;
  qe?: number | null;
  opticsTransmission?: number;
  skyTransmission?: number;
}): number {
  const apertureCm = opts.focalMm / opts.fNumber / 10;
  const area = Math.PI * (apertureCm / 2) ** 2;
  const scale = pixelScaleArcsec(opts.pixelPitchUm, opts.focalMm);
  const omega = scale * scale;
  const bw = opts.color ? 100 : 300;
  return (
    PHOTON_FLUX_V0_PER_NM *
    bw *
    Math.pow(10, -0.4 * opts.sqm) *
    omega *
    area *
    (opts.qe ?? DEFAULT_QE) *
    (opts.opticsTransmission ?? DEFAULT_OPTICS_TRANSMISSION) *
    (opts.skyTransmission ?? 1)
  );
}

export function skyLimitedSubSeconds(readNoiseE: number, skyRate: number): number {
  return (SWAMP_FACTOR * readNoiseE * readNoiseE) / skyRate;
}

export interface IsoGuidance {
  kind: 'iso' | 'gain';
  /** ISO range for photographic cameras; null for astro cameras. */
  isoMin: number | null;
  isoMax: number | null;
  /** Textual recommendation key for astro cameras. */
  gainAdvice: 'unity-or-hcg' | null;
  approximate: boolean;
}

/**
 * ISO/gain guidance. Without advanced sensor data this is deliberately a range:
 * for most modern DSLR/mirrorless sensors ISO 800–1600 balances read noise
 * and dynamic range; brighter skies favour the lower end. We never infer an
 * exact ISO from sensor size.
 */
export function isoGuidance(camera: CameraSpec, sqm: number): IsoGuidance {
  if (camera.kind === 'osc-astro' || camera.kind === 'mono-astro') {
    return {
      kind: 'gain',
      isoMin: null,
      isoMax: null,
      gainAdvice: 'unity-or-hcg',
      approximate: true,
    };
  }
  const hasData = camera.advanced?.readNoiseE != null;
  if (sqm < 19)
    return { kind: 'iso', isoMin: 400, isoMax: 800, gainAdvice: null, approximate: !hasData };
  if (sqm < 20.5)
    return { kind: 'iso', isoMin: 800, isoMax: 1600, gainAdvice: null, approximate: !hasData };
  return { kind: 'iso', isoMin: 800, isoMax: 3200, gainAdvice: null, approximate: !hasData };
}

export type SubLimitReason = 'tracking' | 'trailing' | 'sky-limited' | 'empirical' | 'bright-core';

export interface SubExposureRecommendation {
  recommendedS: number;
  minS: number;
  maxS: number;
  limitedBy: SubLimitReason;
  /** True when a physical sky-limited calculation was possible. */
  physical: boolean;
  skyRateEPerS: number;
  skyLimitedS: number | null;
}

/**
 * Empirical starting sub for cameras without read-noise data: 90 s at f/4,
 * 4.3 µm pixels under a 20.0 mag/arcsec² sky (a common DSLR starting point
 * that puts the histogram peak near ¼–⅓), scaled inversely with the sky
 * electron rate.
 */
export const EMPIRICAL_REFERENCE_SUB_S = 90;

export function recommendSubExposure(opts: {
  camera: CameraSpec;
  focalMm: number;
  fNumber: number;
  sqmEffective: number;
  skyTransmission: number;
  /** Upper limit from tracking or trailing (s); Infinity if none. */
  maxFromMountS: number;
  mountLimitReason: 'tracking' | 'trailing';
  brightCore?: boolean;
}): SubExposureRecommendation {
  const pitch = cameraPixelPitchUm(opts.camera);
  const color = opts.camera.color === 'color';
  const rate = skyElectronRate({
    sqm: opts.sqmEffective,
    focalMm: opts.focalMm,
    fNumber: opts.fNumber,
    pixelPitchUm: pitch,
    color,
    qe: opts.camera.advanced?.qe,
    skyTransmission: opts.skyTransmission,
  });
  const rn = opts.camera.advanced?.readNoiseE;
  let ideal: number;
  let physical = false;
  let skyLimited: number | null = null;
  if (rn != null && rn > 0) {
    skyLimited = skyLimitedSubSeconds(rn, rate);
    ideal = skyLimited;
    physical = true;
  } else {
    const refRate = skyElectronRate({
      sqm: 20.0,
      focalMm: 200,
      fNumber: 4,
      pixelPitchUm: 4.3,
      color: true,
    });
    ideal = EMPIRICAL_REFERENCE_SUB_S * (refRate / rate);
  }
  ideal = clamp(ideal, 1, 900);
  let limitedBy: SubLimitReason = physical ? 'sky-limited' : 'empirical';
  let rec = ideal;
  if (opts.maxFromMountS < rec) {
    rec = opts.maxFromMountS;
    limitedBy = opts.mountLimitReason;
  }
  if (opts.brightCore && rec > 60) {
    rec = Math.min(rec, 60);
    limitedBy = 'bright-core';
  }
  const recommendedS = niceExposure(rec);
  return {
    recommendedS,
    minS: niceExposure(Math.max(recommendedS * 0.5, 0.5)),
    maxS: niceExposure(Math.min(ideal * 1.5, opts.maxFromMountS)),
    limitedBy,
    physical,
    skyRateEPerS: rate,
    skyLimitedS: skyLimited,
  };
}

/* ------------------------------------------------------------------------ */
/* Exposure calibration workflow (Section 27): user reports on a test frame. */
/* ------------------------------------------------------------------------ */

export type HistogramBucket = '<5' | '5-10' | '10-20' | '20-30' | '>30';
export type StarShape = 'round' | 'mild' | 'obvious';
export type Clipping = 'none' | 'mild' | 'excessive';

export interface CalibrationFeedback {
  histogram: HistogramBucket;
  stars: StarShape;
  clipping: Clipping;
}

export type CalibrationAdviceCode =
  | 'trailing-obvious'
  | 'trailing-mild'
  | 'histogram-very-low'
  | 'histogram-low'
  | 'histogram-good'
  | 'histogram-high'
  | 'clipping-excessive'
  | 'clipping-mild'
  | 'limited-by-mount';

export interface CalibrationSuggestion {
  currentS: number;
  suggestedS: number;
  factor: number;
  advice: CalibrationAdviceCode[];
  /** Suggest recording this focal length/exposure as a mount calibration point. */
  suggestMountCalibration: boolean;
}

/**
 * Explainable adjustment rules. Reductions (trailing, clipping, overexposed
 * background) take precedence over increases; increases are capped by the
 * mount/trailing limit.
 */
export function suggestFromTestFrame(
  currentS: number,
  fb: CalibrationFeedback,
  maxFromMountS = Number.POSITIVE_INFINITY,
): CalibrationSuggestion {
  const advice: CalibrationAdviceCode[] = [];
  const reductions: number[] = [];
  let increase = 1;
  if (fb.stars === 'obvious') {
    reductions.push(0.5);
    advice.push('trailing-obvious');
  } else if (fb.stars === 'mild') {
    reductions.push(0.75);
    advice.push('trailing-mild');
  }
  if (fb.clipping === 'excessive') {
    reductions.push(0.5);
    advice.push('clipping-excessive');
  } else if (fb.clipping === 'mild') {
    reductions.push(0.85);
    advice.push('clipping-mild');
  }
  switch (fb.histogram) {
    case '<5':
      increase = 2;
      advice.push('histogram-very-low');
      break;
    case '5-10':
      increase = 1.5;
      advice.push('histogram-low');
      break;
    case '10-20':
    case '20-30':
      advice.push('histogram-good');
      break;
    case '>30':
      reductions.push(0.6);
      advice.push('histogram-high');
      break;
  }
  let factor = reductions.length > 0 ? Math.min(...reductions) : increase;
  let suggested = currentS * factor;
  if (suggested > maxFromMountS) {
    suggested = maxFromMountS;
    factor = suggested / currentS;
    advice.push('limited-by-mount');
  }
  return {
    currentS,
    suggestedS: niceExposure(suggested),
    factor,
    advice,
    suggestMountCalibration: fb.stars === 'round',
  };
}
