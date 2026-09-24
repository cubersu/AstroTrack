/**
 * Feature-based equipment model. The scientific engine only ever sees
 * physical properties; brand/model names are cosmetic labels.
 */
import type { FilterBand, FilterKind } from './lightPollution';
import { derivePixelPitchUm } from './pixelScale';

export type CameraKind = 'dslr' | 'mirrorless' | 'osc-astro' | 'mono-astro';
export type SensorColor = 'color' | 'mono';
export type Modification = 'stock' | 'astro-modified' | 'full-spectrum';

export interface SensorAdvanced {
  /** Read noise in electrons (at the intended ISO/gain). */
  readNoiseE?: number | null;
  /** Full-well capacity in electrons. */
  fullWellE?: number | null;
  /** System gain in e⁻/ADU at the intended ISO/gain. */
  gainEPerAdu?: number | null;
  /** Dynamic range in stops. */
  dynamicRangeStops?: number | null;
  /** Peak quantum efficiency 0..1. */
  qe?: number | null;
}

export interface CameraSpec {
  sensorWidthMm: number;
  sensorHeightMm: number;
  resolutionX: number;
  resolutionY: number;
  /** Optional explicit pixel pitch (µm); derived from geometry if absent. */
  pixelPitchUm?: number | null;
  color: SensorColor;
  kind: CameraKind;
  modification: Modification;
  advanced?: SensorAdvanced | null;
}

export type OpticsKind = 'lens' | 'telescope';

export interface OpticsSpec {
  kind: OpticsKind;
  /** Prime focal length, or the short end of a zoom (mm). */
  focalLengthMm: number;
  /** Long end of a zoom (mm); absent/null for primes and telescopes. */
  focalLengthMaxMm?: number | null;
  /** Clear aperture diameter (mm), if known. */
  apertureMm?: number | null;
  /** Maximum aperture as f-number (at the short end for zooms). */
  fNumber?: number | null;
  /** Maximum aperture f-number at the long end of a variable-aperture zoom. */
  fNumberAtMax?: number | null;
  /** Preferred astro aperture: 'auto' or a specific f-number. */
  preferredFNumber?: number | 'auto' | null;
  /** Reducer (<1) / Barlow (>1) multiplier applied to focal length and f-ratio. */
  multiplier?: number | null;
}

export interface MountSpec {
  tracking: boolean;
  equatorial: boolean;
  guiding: boolean;
  payloadKg?: number | null;
  calibration?: MountCalibrationPoint[];
}

export interface MountCalibrationPoint {
  focalLengthMm: number;
  /** Longest exposure (s) that reliably gives round stars at this focal length. */
  reliableExposureS: number;
  source?: 'manual' | 'journal';
}

export interface FilterSpec {
  kind: FilterKind;
  bands?: FilterBand[];
}

export function cameraPixelPitchUm(c: CameraSpec): number {
  if (c.pixelPitchUm && c.pixelPitchUm > 0) return c.pixelPitchUm;
  return derivePixelPitchUm(c.sensorWidthMm, c.sensorHeightMm, c.resolutionX, c.resolutionY)
    .pitchUm;
}

/** Crop factor relative to a 36×24 mm sensor (diagonal ratio). */
export function cropFactor(c: Pick<CameraSpec, 'sensorWidthMm' | 'sensorHeightMm'>): number {
  return Math.hypot(36, 24) / Math.hypot(c.sensorWidthMm, c.sensorHeightMm);
}

export function isZoom(o: OpticsSpec): boolean {
  return o.focalLengthMaxMm != null && o.focalLengthMaxMm > o.focalLengthMm;
}

export function opticsMultiplier(o: OpticsSpec): number {
  return o.multiplier && o.multiplier > 0 ? o.multiplier : 1;
}

/**
 * Native (before multiplier) maximum-aperture f-number at a native focal length.
 * f-number = focal length / aperture diameter when only the diameter is known.
 * For variable-aperture zooms it is interpolated in log focal length between
 * the short- and long-end values.
 */
export function maxApertureFNumber(o: OpticsSpec, nativeFocalMm: number): number | null {
  if (o.fNumber && o.fNumber > 0) {
    if (isZoom(o) && o.fNumberAtMax && o.fNumberAtMax > 0) {
      const f0 = Math.log(o.focalLengthMm);
      const f1 = Math.log(o.focalLengthMaxMm!);
      const t = Math.min(Math.max((Math.log(nativeFocalMm) - f0) / (f1 - f0), 0), 1);
      return o.fNumber + (o.fNumberAtMax - o.fNumber) * t;
    }
    return o.fNumber;
  }
  if (o.apertureMm && o.apertureMm > 0) return nativeFocalMm / o.apertureMm;
  return null;
}

/** Aperture diameter from focal length and f-number (mm). */
export function apertureFromFNumber(focalMm: number, fNumber: number): number {
  return focalMm / fNumber;
}

/** f-number from focal length and aperture diameter. */
export function fNumberFromAperture(focalMm: number, apertureMm: number): number {
  return focalMm / apertureMm;
}

export interface ApertureChoice {
  fNumber: number;
  /** 'wide-open' | 'auto-stopped' | 'user' */
  basis: 'wide-open' | 'auto-stopped' | 'user';
  /** True when the automatic rule was used for a camera lens (coma warning). */
  warnAberrations: boolean;
}

/**
 * Recommended working aperture.
 * Camera lenses: maximum aperture is rarely optimal because of coma,
 * astigmatism and vignetting in the corners. Automatic starting point:
 *   N_max ≤ 2.8 → stop down ~1 stop (×√2), but not faster than f/2.8
 *   2.8 < N_max < 5 → stop down ~½ stop (×1.19)
 *   N_max ≥ 5 → wide open
 * Telescopes are used at their native (fixed) focal ratio.
 */
export function workingAperture(o: OpticsSpec, nativeFocalMm: number): ApertureChoice | null {
  const nMax = maxApertureFNumber(o, nativeFocalMm);
  if (nMax === null) return null;
  const m = opticsMultiplier(o);
  if (typeof o.preferredFNumber === 'number' && o.preferredFNumber >= nMax) {
    return { fNumber: o.preferredFNumber * m, basis: 'user', warnAberrations: false };
  }
  if (o.kind === 'telescope')
    return { fNumber: nMax * m, basis: 'wide-open', warnAberrations: false };
  let n: number;
  if (nMax <= 2.8) n = Math.max(nMax * Math.SQRT2, 2.8);
  else if (nMax < 5) n = nMax * 1.19;
  else n = nMax;
  // Round to the nearest standard 1/3-stop value for display friendliness.
  n = nearestStandardFNumber(n);
  if (n < nMax) n = nMax;
  return {
    fNumber: n * m,
    basis: n === nMax ? 'wide-open' : 'auto-stopped',
    warnAberrations: true,
  };
}

const STANDARD_F = [
  1, 1.1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11,
];

export function nearestStandardFNumber(n: number): number {
  let best = STANDARD_F[0];
  for (const s of STANDARD_F)
    if (Math.abs(Math.log(s / n)) < Math.abs(Math.log(best / n))) best = s;
  return n > 11 ? Math.round(n * 10) / 10 : best;
}
