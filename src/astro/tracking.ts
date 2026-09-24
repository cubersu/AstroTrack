/**
 * Tracking-mode sub-exposure limits from empirical mount calibration.
 *
 * Unguided tracking error (periodic error, polar-alignment drift) is roughly
 * constant in arcseconds, and the trailing tolerance in arcseconds scales with
 * the pixel scale ∝ 1/f. The reliable exposure therefore scales roughly as
 * t ∝ 1/f. Between calibration points we interpolate in log–log space;
 * outside them we extrapolate with t ∝ 1/f from the nearest point and flag
 * the result (confidence drops further beyond 2× the calibrated range).
 */
import type { MountCalibrationPoint, MountSpec } from './equipment';

/** Default assumption for an uncalibrated, unguided equatorial mount: t = K / f. */
export const DEFAULT_UNGUIDED_K_MM_S = 12000;
/** Cap for uncalibrated unguided exposures (s). */
export const DEFAULT_UNGUIDED_CAP_S = 300;
/** Practical cap for guided exposures (s) — sky background usually limits earlier. */
export const DEFAULT_GUIDED_CAP_S = 600;

export type TrackingLimitSource =
  | 'calibrated'
  | 'interpolated'
  | 'extrapolated'
  | 'extrapolated-far'
  | 'default-unguided'
  | 'guided'
  | 'none';

export interface TrackingLimit {
  seconds: number;
  source: TrackingLimitSource;
}

export function interpolateCalibration(
  points: MountCalibrationPoint[],
  focalMm: number,
): TrackingLimit | null {
  const pts = points
    .filter((p) => p.focalLengthMm > 0 && p.reliableExposureS > 0)
    .sort((a, b) => a.focalLengthMm - b.focalLengthMm);
  if (pts.length === 0) return null;
  const exact = pts.find((p) => Math.abs(p.focalLengthMm - focalMm) / focalMm < 0.02);
  if (exact) return { seconds: exact.reliableExposureS, source: 'calibrated' };
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (focalMm < first.focalLengthMm || focalMm > last.focalLengthMm) {
    const near = focalMm < first.focalLengthMm ? first : last;
    const ratio = focalMm / near.focalLengthMm;
    const far = ratio > 2 || ratio < 0.5;
    return {
      seconds: (near.reliableExposureS * near.focalLengthMm) / focalMm,
      source: far ? 'extrapolated-far' : 'extrapolated',
    };
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (focalMm >= a.focalLengthMm && focalMm <= b.focalLengthMm) {
      const t =
        (Math.log(focalMm) - Math.log(a.focalLengthMm)) /
        (Math.log(b.focalLengthMm) - Math.log(a.focalLengthMm));
      const ls =
        Math.log(a.reliableExposureS) +
        t * (Math.log(b.reliableExposureS) - Math.log(a.reliableExposureS));
      return { seconds: Math.exp(ls), source: 'interpolated' };
    }
  }
  return null;
}

/** Tracking limit for a mount at a focal length (tracking mode only). */
export function trackingLimit(mount: MountSpec, focalMm: number): TrackingLimit {
  if (!mount.tracking) return { seconds: 0, source: 'none' };
  const cal = mount.calibration ? interpolateCalibration(mount.calibration, focalMm) : null;
  if (cal) return cal;
  if (mount.guiding) return { seconds: DEFAULT_GUIDED_CAP_S, source: 'guided' };
  return {
    seconds: Math.min(DEFAULT_UNGUIDED_K_MM_S / focalMm, DEFAULT_UNGUIDED_CAP_S),
    source: 'default-unguided',
  };
}
