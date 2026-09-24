/**
 * Total integration-time guidance (Minimum / Recommended / Ideal).
 *
 * Physical core — sky-limited per-pixel SNR: SNR = τs·S·t / √((τb·B + τs·S)·t)
 * gives, for equal SNR, t ∝ (τb·B + τs·S) / (τs·S)². Relative to the reference
 * setup (no filter, Hα-sensitive colour camera, Bortle-4 sky B_ref):
 *
 *   R_phys = (τb·B + τs·S) / (τs² · (B_ref + S))
 *
 * B includes the mean moonlight over the imaging window; S the mean target
 * surface flux (after mean-airmass extinction). Filters and camera spectral
 * response enter through τs (signal) and τb (sky).
 *
 * Empirical layer — clearly labelled as such in the UI and docs:
 *   Recommended = base(type) · F_sb · R_phys^0.5 · (N/5)² · F_mono
 *     F_sb  = 10^(0.3 · clamp(SB − SB_ref(type), −3, 3))   (softened SB scaling)
 *     0.5   = softening exponent: in poorer conditions a proportionally lower
 *             SNR is accepted as "recommended" (the SNR penalty is split
 *             between extra time and accepted quality); matching reference
 *             quality needs the full R_phys factor, which the Ideal value
 *             approaches in typical conditions.
 *   Minimum = 0.3 × Recommended   (≈ 55% of the SNR, since SNR ∝ √t)
 *   Ideal   = 3 × Recommended     (≈ 173% of the SNR)
 * Values are clamped to [0.25 h, 30 h] (Recommended) and flagged when capped.
 */
import type { DsoType } from './objectTypes';
import { TYPE_PROFILES } from './objectTypes';
import type { Transmission } from './lightPollution';
import { PRISTINE_SKY_SQM, REFERENCE_SKY_SQM } from './lightPollution';
import { relativeFlux } from './skyBrightness';
import { clamp } from './units';

export const SB_SOFTENING = 0.3;
export const R_PHYS_EXPONENT = 0.5;
export const MINIMUM_FRACTION = 0.3;
export const IDEAL_FACTOR = 3;
export const REFERENCE_F_NUMBER = 5;
export const MONO_TIME_FACTOR = 0.8;
export const RECOMMENDED_MIN_H = 0.25;
export const RECOMMENDED_MAX_H = 30;

export interface IntegrationInput {
  type: DsoType;
  sbV: number;
  /** Effective moonless site sky at zenith (mag/arcsec²). */
  siteSqm: number;
  /** Mean moonlight sky brightness relative to pristine sky flux (linear, ≥0). */
  moonRelFlux: number;
  /** Mean air mass of the imaging window (≥1). */
  meanAirmass: number;
  extinctionK: number;
  fNumber: number;
  transmission: Transmission;
  mono: boolean;
}

export interface IntegrationResult {
  minimumH: number;
  recommendedH: number;
  idealH: number;
  capped: boolean;
  factors: {
    base: number;
    surfaceBrightness: number;
    physical: number;
    fRatio: number;
    mono: number;
  };
}

export function physicalTimeFactor(
  sRel: number,
  bRel: number,
  bRefRel: number,
  tr: Transmission,
): number {
  const ts = Math.max(tr.signal, 1e-4);
  return (tr.sky * bRel + ts * sRel) / (ts * ts * (bRefRel + sRel));
}

export function integrationGuidance(inp: IntegrationInput): IntegrationResult {
  const prof = TYPE_PROFILES[inp.type];
  const base = prof.baseIntegrationH;
  const fSb = Math.pow(10, SB_SOFTENING * clamp(inp.sbV - prof.referenceSurfaceBrightness, -3, 3));
  const ext = Math.pow(10, -0.4 * inp.extinctionK * (Math.max(inp.meanAirmass, 1) - 1));
  const sRel = relativeFlux(inp.sbV, PRISTINE_SKY_SQM) * ext;
  const bRel = relativeFlux(inp.siteSqm, PRISTINE_SKY_SQM) + inp.moonRelFlux;
  const bRefRel = relativeFlux(REFERENCE_SKY_SQM, PRISTINE_SKY_SQM);
  const phys = physicalTimeFactor(sRel, bRel, bRefRel, inp.transmission);
  const fRatio = (inp.fNumber / REFERENCE_F_NUMBER) ** 2;
  const mono = inp.mono ? MONO_TIME_FACTOR : 1;
  const raw = base * fSb * Math.pow(phys, R_PHYS_EXPONENT) * fRatio * mono;
  const rec = clamp(raw, RECOMMENDED_MIN_H, RECOMMENDED_MAX_H);
  return {
    minimumH: rec * MINIMUM_FRACTION,
    recommendedH: rec,
    idealH: rec * IDEAL_FACTOR,
    capped: raw > RECOMMENDED_MAX_H,
    factors: { base, surfaceBrightness: fSb, physical: phys, fRatio, mono },
  };
}

/** Relative SNR of an integration t compared with a reference integration (SNR ∝ √t). */
export function relativeSnr(tH: number, refH: number): number {
  return refH > 0 ? Math.sqrt(tH / refH) : 0;
}
