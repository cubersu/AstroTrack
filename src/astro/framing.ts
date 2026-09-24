/**
 * Framing: how well a target fits a sensor at a focal length, the best
 * focal length within a zoom range, and the camera rotation that aligns the
 * target's major axis with the sensor's long side.
 */
import { fieldOfView } from './fieldOfView';
import { pixelScaleArcsec } from './pixelScale';
import { clamp, interpolateTable, norm180 } from './units';

export type FramingStyle = 'wide' | 'balanced' | 'tight';

/**
 * Target "fill" bands per style: the fraction of the frame (after optimal
 * rotation) spanned by the target, fill = max(a/W, b/H).
 */
export const FILL_BANDS: Record<FramingStyle, { lo: number; hi: number; ideal: number }> = {
  wide: { lo: 0.2, hi: 0.4, ideal: 0.3 },
  balanced: { lo: 0.4, hi: 0.7, ideal: 0.55 },
  tight: { lo: 0.7, hi: 0.9, ideal: 0.8 },
};

/** Default hard limits (advanced settings may tune them). */
export const DEFAULT_MIN_FILL = 0.015;
export const DEFAULT_MIN_TARGET_PX = 20;
/** Beyond this fill (≈ a 2×2 mosaic or more) a single frame is considered unreasonable. */
export const MAX_REASONABLE_FILL = 2;

export interface TargetShape {
  majorArcmin: number;
  /** Minor axis; defaults to the major axis when unknown. */
  minorArcmin?: number | null;
  /** Position angle of the major axis, degrees N→E. */
  positionAngleDeg?: number | null;
}

export interface SensorGeometry {
  widthMm: number;
  heightMm: number;
  pixelPitchUm: number;
}

export interface FramingResult {
  focalLengthMm: number;
  fovWidthDeg: number;
  fovHeightDeg: number;
  fovDiagonalDeg: number;
  pixelScaleArcsec: number;
  /** Fraction of the frame spanned, after optimal rotation. */
  fill: number;
  /** Target major axis in pixels. */
  targetPx: number;
  fits: boolean;
  mosaicSuggested: boolean;
  tooSmall: boolean;
  tooLarge: boolean;
  score: number;
  /** Suggested sensor long-side position angle (deg, N→E, 0..180), or null if not meaningful. */
  rotationDeg: number | null;
  orientation: 'landscape' | 'portrait' | 'any' | 'angled';
}

/** Rotation-optimal fill: major axis along the long side, minor along the short side. */
export function fillFraction(
  target: TargetShape,
  fovWidthDeg: number,
  fovHeightDeg: number,
): number {
  const a = target.majorArcmin / 60;
  const b = (target.minorArcmin ?? target.majorArcmin) / 60;
  const long = Math.max(fovWidthDeg, fovHeightDeg);
  const short = Math.min(fovWidthDeg, fovHeightDeg);
  return Math.max(a / long, b / short);
}

/** Framing score (0–100) for a fill fraction and style. */
export function framingScoreFromFill(fill: number, style: FramingStyle): number {
  const { lo, hi } = FILL_BANDS[style];
  if (!(fill > 0)) return 0;
  if (fill < lo) return clamp(100 * Math.pow(fill / lo, 0.55), 0, 100);
  if (fill <= hi) return 100;
  if (fill <= 1) return 100 - ((fill - hi) / (1 - hi || 1)) * 25;
  return interpolateTable(
    [
      [1, 70],
      [1.25, 45],
      [1.5, 30],
      [2, 15],
      [3, 5],
      [5, 0],
    ],
    fill,
  );
}

/**
 * Suggested camera rotation: the position angle (N→E) at which the sensor's
 * long side should lie, equal to the target's major-axis PA. Returned in
 * [0, 180). Not meaningful for round targets or unknown PA.
 */
export function suggestedRotation(target: TargetShape): {
  rotationDeg: number | null;
  orientation: FramingResult['orientation'];
} {
  const b = target.minorArcmin ?? target.majorArcmin;
  const elongation = target.majorArcmin > 0 ? b / target.majorArcmin : 1;
  if (target.positionAngleDeg == null || elongation > 0.8) {
    return { rotationDeg: null, orientation: 'any' };
  }
  const pa = ((target.positionAngleDeg % 180) + 180) % 180;
  // Landscape = long side east–west (PA 90°); portrait = north–south (PA 0°).
  const dLand = Math.abs(norm180(pa - 90));
  const dPort = Math.min(Math.abs(norm180(pa)), Math.abs(norm180(pa - 180)));
  let orientation: FramingResult['orientation'] = 'angled';
  if (dLand <= 15) orientation = 'landscape';
  else if (dPort <= 15) orientation = 'portrait';
  return { rotationDeg: pa, orientation };
}

export interface FramingLimits {
  minFill?: number;
  minTargetPx?: number;
}

export function evaluateFraming(
  target: TargetShape,
  sensor: SensorGeometry,
  focalLengthMm: number,
  style: FramingStyle,
  limits: FramingLimits = {},
): FramingResult {
  const fov = fieldOfView(sensor.widthMm, sensor.heightMm, focalLengthMm);
  const scale = pixelScaleArcsec(sensor.pixelPitchUm, focalLengthMm);
  const fill = fillFraction(target, fov.widthDeg, fov.heightDeg);
  const targetPx = (target.majorArcmin * 60) / scale;
  const minFill = limits.minFill ?? DEFAULT_MIN_FILL;
  const minPx = limits.minTargetPx ?? DEFAULT_MIN_TARGET_PX;
  const tooSmall = fill < minFill || targetPx < minPx;
  const tooLarge = fill > MAX_REASONABLE_FILL;
  const rot = suggestedRotation(target);
  return {
    focalLengthMm,
    fovWidthDeg: fov.widthDeg,
    fovHeightDeg: fov.heightDeg,
    fovDiagonalDeg: fov.diagonalDeg,
    pixelScaleArcsec: scale,
    fill,
    targetPx,
    fits: fill <= 1,
    mosaicSuggested: fill > 1,
    tooSmall,
    tooLarge,
    score: framingScoreFromFill(fill, style),
    rotationDeg: rot.rotationDeg,
    orientation: rot.orientation,
  };
}

/**
 * Best focal length within [fMin, fMax] for a style. Because fill scales
 * almost linearly with focal length for small fields, the ideal focal length
 * is found analytically and refined numerically, then clamped to the range.
 */
export function bestFocalLength(
  target: TargetShape,
  sensor: SensorGeometry,
  fMinMm: number,
  fMaxMm: number,
  style: FramingStyle,
  limits: FramingLimits = {},
): FramingResult {
  const lo = Math.min(fMinMm, fMaxMm);
  const hi = Math.max(fMinMm, fMaxMm);
  if (hi - lo < 1e-6) return evaluateFraming(target, sensor, lo, style, limits);
  const ideal = FILL_BANDS[style].ideal;
  const atHi = evaluateFraming(target, sensor, hi, style, limits);
  let f = clamp((hi * ideal) / atHi.fill, lo, hi);
  // One refinement step (FOV is not exactly ∝ 1/f for wide fields).
  const r1 = evaluateFraming(target, sensor, f, style, limits);
  f = clamp((f * ideal) / r1.fill, lo, hi);
  let best = evaluateFraming(target, sensor, f, style, limits);
  // Guard: compare with the range ends (non-monotonic cases, e.g. round-off).
  for (const cand of [lo, hi]) {
    const r = evaluateFraming(target, sensor, cand, style, limits);
    if (r.score > best.score + 0.5) best = r;
  }
  // Prefer rounder focal lengths for display (nearest mm).
  const rounded = Math.round(best.focalLengthMm);
  if (rounded >= lo && rounded <= hi)
    best = evaluateFraming(target, sensor, rounded, style, limits);
  return best;
}
