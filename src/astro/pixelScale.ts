import { ARCSEC_PER_RAD } from './units';

/**
 * Pixel scale in arcseconds per pixel.
 *   scale = 206.265 · pixelPitch[µm] / focalLength[mm]
 * (206.265 = 206264.8″/rad × 10⁻³ mm/µm)
 */
export function pixelScaleArcsec(pixelPitchUm: number, focalLengthMm: number): number {
  if (!(pixelPitchUm > 0) || !(focalLengthMm > 0)) return Number.NaN;
  return (ARCSEC_PER_RAD * (pixelPitchUm / 1000)) / focalLengthMm;
}

/**
 * Pixel pitch (µm) derived from sensor size and resolution. Uses the width
 * axis; if the height-derived pitch differs by more than 2% the sensor has
 * non-square pixels or the inputs are inconsistent, and the mean is returned
 * together with a flag.
 */
export function derivePixelPitchUm(
  sensorWidthMm: number,
  sensorHeightMm: number,
  resolutionX: number,
  resolutionY: number,
): { pitchUm: number; consistent: boolean } {
  const px = (sensorWidthMm / resolutionX) * 1000;
  const py = (sensorHeightMm / resolutionY) * 1000;
  const consistent = Math.abs(px - py) / Math.max(px, py) <= 0.02;
  return { pitchUm: consistent ? px : (px + py) / 2, consistent };
}

/**
 * Sampling relative to seeing/optics: returns the number of pixels across a
 * star FWHM. ~2–3 px is well sampled, < 1.5 under-sampled, > 4 over-sampled.
 */
export function pixelsPerFwhm(fwhmArcsec: number, scaleArcsec: number): number {
  return fwhmArcsec / scaleArcsec;
}

/** Diffraction-limited Airy-disk FWHM in arcseconds for aperture D (mm) at λ (nm). */
export function airyFwhmArcsec(apertureMm: number, wavelengthNm = 550): number {
  return 1.029 * ((wavelengthNm * 1e-9) / (apertureMm * 1e-3)) * ARCSEC_PER_RAD;
}
