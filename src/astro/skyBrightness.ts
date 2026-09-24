/**
 * Sky-brightness photometry helpers shared by the light-pollution and Moon models.
 *
 * Conversion between V-band surface brightness (mag/arcsec²) and nanolamberts
 * from Krisciunas & Schaefer (1991), PASP 103, 1033, eq. (1):
 *
 *   B[nL] = 34.08 · exp(20.7233 − 0.92104 · V)
 */

export function magArcsec2ToNanoLambert(v: number): number {
  return 34.08 * Math.exp(20.7233 - 0.92104 * v);
}

export function nanoLambertToMagArcsec2(bNl: number): number {
  return (20.7233 - Math.log(bNl / 34.08)) / 0.92104;
}

/** Relative linear flux of a surface brightness with respect to a reference (both mag/arcsec²). */
export function relativeFlux(mag: number, referenceMag: number): number {
  return Math.pow(10, -0.4 * (mag - referenceMag));
}

/**
 * Air mass formula used by Krisciunas & Schaefer for scattering geometry:
 *   X(Z) = (1 − 0.96 sin² Z)^−1/2
 */
export function ksAirmass(zenithDistDeg: number): number {
  const z = Math.min(zenithDistDeg, 90) * (Math.PI / 180);
  const s = Math.sin(z);
  return 1 / Math.sqrt(1 - 0.96 * s * s);
}

/** Default V-band extinction coefficient (mag/airmass) for a typical low-altitude site. */
export const DEFAULT_EXTINCTION_K = 0.25;

/**
 * Sky brightness (nL) at zenith distance Z given the zenith value, following
 * the K&S dark-sky variation B(Z) = B_zen · 10^(−0.4 k (X−1)) · X.
 * Applied to the total (natural + artificial) sky as a documented simplification.
 */
export function skyBrightnessAtZenithDistance(
  zenithNl: number,
  zenithDistDeg: number,
  k = DEFAULT_EXTINCTION_K,
): number {
  const x = ksAirmass(zenithDistDeg);
  return zenithNl * Math.pow(10, -0.4 * k * (x - 1)) * x;
}
