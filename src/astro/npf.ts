/**
 * Fixed-tripod (untracked) star-trailing limits.
 *
 * Primary method: the NPF rule by Frédéric Michaud (Société d'Astronomie
 * Populaire, Toulouse), detailed form including declination:
 *
 *   t = (16.856 · N + 0.0997 · f + 13.713 · p) / (f · cos δ)
 *
 *   N = f-number, f = focal length (mm), p = pixel pitch (µm), δ = declination.
 *
 * The simplified NPF form is t ≈ (35·N + 30·p) / f (δ = 0).
 *
 * The legacy "500 rule" (t = 500 / (f · crop)) is provided for comparison only;
 * it ignores pixel pitch and produces visible trails on modern sensors.
 *
 * Trail length: an equatorial star drifts 15.041″/s × cos δ; the trail in pixels
 * over t seconds is 15.041 · cos δ · t / pixelScale.
 */
import { pixelScaleArcsec } from './pixelScale';
import { DEG2RAD } from './units';

export const SIDEREAL_ARCSEC_PER_SECOND = 15.041;
/** Declinations closer to the pole than this are clamped (the formula diverges at the pole). */
export const NPF_MAX_ABS_DEC_DEG = 80;

export type TrailingTolerance = 'safe' | 'balanced' | 'aggressive';

/**
 * Multipliers applied to the detailed NPF result for the three presets.
 *  - Safe (1.0×): the detailed NPF rule itself — stars essentially round at
 *    100% view (typically ≲ 2 px of drift).
 *  - Balanced (1.5×): between the detailed and the simplified NPF rule; slight
 *    elongation may be visible when pixel-peeping, not at normal viewing sizes.
 *  - Aggressive (2.0×): roughly the simplified NPF rule; elongation is visible
 *    at 100% but often acceptable for web-sized images.
 * The resulting trail length in pixels is always reported alongside, so the
 * tolerance is explicit. Tunable in advanced settings.
 */
export const TRAILING_MULTIPLIERS: Record<TrailingTolerance, number> = {
  safe: 1.0,
  balanced: 1.5,
  aggressive: 2.0,
};

function cosDec(decDeg: number): number {
  const d = Math.min(Math.abs(decDeg), NPF_MAX_ABS_DEC_DEG);
  return Math.cos(d * DEG2RAD);
}

/** Detailed NPF maximum exposure (seconds). */
export function npfSeconds(
  fNumber: number,
  focalLengthMm: number,
  pixelPitchUm: number,
  decDeg = 0,
): number {
  return (
    (16.856 * fNumber + 0.0997 * focalLengthMm + 13.713 * pixelPitchUm) /
    (focalLengthMm * cosDec(decDeg))
  );
}

/** Simplified NPF (equator). */
export function npfSimpleSeconds(
  fNumber: number,
  focalLengthMm: number,
  pixelPitchUm: number,
): number {
  return (35 * fNumber + 30 * pixelPitchUm) / focalLengthMm;
}

/** Legacy 500 rule — comparison only. `cropFactor` relative to 36×24 mm. */
export function rule500Seconds(focalLengthMm: number, cropFactor: number): number {
  return 500 / (focalLengthMm * cropFactor);
}

/** Star trail length in pixels for an exposure of t seconds. */
export function trailLengthPx(
  exposureS: number,
  focalLengthMm: number,
  pixelPitchUm: number,
  decDeg: number,
): number {
  const scale = pixelScaleArcsec(pixelPitchUm, focalLengthMm);
  return (SIDEREAL_ARCSEC_PER_SECOND * cosDec(decDeg) * exposureS) / scale;
}

/**
 * Effective declination for a framed field: the frame edge closest to the
 * celestial equator trails fastest, so the calculation uses that edge.
 */
export function effectiveTrailingDec(centerDecDeg: number, frameHeightDeg: number): number {
  const a = Math.abs(centerDecDeg) - frameHeightDeg / 2;
  return Math.max(0, a) * Math.sign(centerDecDeg || 1);
}

export interface FixedTripodOption {
  tolerance: TrailingTolerance;
  exposureS: number;
  trailPx: number;
}

export function fixedTripodOptions(
  fNumber: number,
  focalLengthMm: number,
  pixelPitchUm: number,
  decDeg: number,
  multipliers: Record<TrailingTolerance, number> = TRAILING_MULTIPLIERS,
): FixedTripodOption[] {
  const base = npfSeconds(fNumber, focalLengthMm, pixelPitchUm, decDeg);
  return (['safe', 'balanced', 'aggressive'] as const).map((tolerance) => {
    const exposureS = base * multipliers[tolerance];
    return {
      tolerance,
      exposureS,
      trailPx: trailLengthPx(exposureS, focalLengthMm, pixelPitchUm, decDeg),
    };
  });
}

/**
 * Field rotation limit for alt-azimuth tracking (not equatorial).
 * Field rotation rate (rad/s) = ω⊕ · cos φ · cos A / cos h (A azimuth from N, h altitude).
 * A star at distance r (pixels) from the rotation centre moves r·θ pixels;
 * the exposure for a maximum drift of `maxPx` at the frame corner is returned.
 */
export function altAzFieldRotationLimitS(
  latDeg: number,
  azDeg: number,
  altDeg: number,
  halfDiagonalPx: number,
  maxPx = 1,
): number {
  const omega = 7.2921159e-5; // Earth rotation rad/s
  const rate = Math.abs(
    (omega * Math.cos(latDeg * DEG2RAD) * Math.cos(azDeg * DEG2RAD)) /
      Math.max(Math.cos(Math.min(altDeg, 89) * DEG2RAD), 1e-3),
  );
  if (rate < 1e-12) return Number.POSITIVE_INFINITY;
  return maxPx / (halfDiagonalPx * rate);
}
