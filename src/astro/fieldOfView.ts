import { RAD2DEG } from './units';

/**
 * Angular field of view (degrees) for a linear sensor dimension d (mm) at
 * focal length f (mm), using the exact rectilinear-projection formula:
 *   FOV = 2 · atan(d / 2f)
 */
export function angularFovDeg(dimensionMm: number, focalLengthMm: number): number {
  if (!(dimensionMm > 0) || !(focalLengthMm > 0)) return Number.NaN;
  return 2 * Math.atan(dimensionMm / (2 * focalLengthMm)) * RAD2DEG;
}

export interface FieldOfView {
  widthDeg: number;
  heightDeg: number;
  diagonalDeg: number;
  /** Solid angle approximation, deg² (width × height; adequate for FOVs < ~30°). */
  areaDeg2: number;
}

export function fieldOfView(
  sensorWidthMm: number,
  sensorHeightMm: number,
  focalLengthMm: number,
): FieldOfView {
  const widthDeg = angularFovDeg(sensorWidthMm, focalLengthMm);
  const heightDeg = angularFovDeg(sensorHeightMm, focalLengthMm);
  const diagonalDeg = angularFovDeg(Math.hypot(sensorWidthMm, sensorHeightMm), focalLengthMm);
  return { widthDeg, heightDeg, diagonalDeg, areaDeg2: widthDeg * heightDeg };
}

/** Focal length (mm) at which a sensor dimension spans the given angle (degrees). */
export function focalLengthForFov(dimensionMm: number, fovDeg: number): number {
  return dimensionMm / (2 * Math.tan(fovDeg / RAD2DEG / 2));
}
