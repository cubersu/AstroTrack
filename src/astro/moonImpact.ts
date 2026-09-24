/**
 * Moonlight sky brightening — Krisciunas & Schaefer (1991), "A model of the
 * brightness of moonlight", PASP 103, 1033–1039.
 *
 *   I*(α)  = 10^(−0.4 (3.84 + 0.026|α| + 4·10⁻⁹ α⁴))            (eq. 20)
 *            × (1.35 − 0.05|α|) for |α| < 7° (opposition surge)
 *   f(ρ)   = 10^5.36 · (1.06 + cos²ρ) + 10^(6.15 − ρ/40)          (eq. 21)
 *   X(Z)   = (1 − 0.96 sin² Z)^−1/2                                (eq. 3)
 *   B_moon = f(ρ) · I* · 10^(−0.4 k X(Z_m)) · (1 − 10^(−0.4 k X(Z)))   [nL] (eq. 15)
 *
 * α = lunar phase angle (0 = full), ρ = Moon–target separation, Z_m / Z the
 * zenith distances of Moon and target, k the extinction coefficient. The
 * model is calibrated for ρ ≳ 10°; closer separations are clamped and flagged.
 */
import { ksAirmass, DEFAULT_EXTINCTION_K } from './skyBrightness';
import { DEG2RAD } from './units';

export const MOON_MODEL_MIN_SEPARATION_DEG = 10;

export function moonIlluminanceKs(phaseAngleDeg: number): number {
  const a = Math.abs(phaseAngleDeg);
  let i = Math.pow(10, -0.4 * (3.84 + 0.026 * a + 4e-9 * a ** 4));
  if (a < 7) i *= 1.35 - 0.05 * a;
  return i;
}

export function moonScatteringKs(separationDeg: number): number {
  const rho = Math.max(separationDeg, MOON_MODEL_MIN_SEPARATION_DEG);
  const c = Math.cos(rho * DEG2RAD);
  return Math.pow(10, 5.36) * (1.06 + c * c) + Math.pow(10, 6.15 - rho / 40);
}

/**
 * Moonlight sky brightness in nanolamberts at the target position.
 * Returns 0 when the Moon is below the horizon or the target is below it.
 */
export function moonSkyBrightnessNl(
  phaseAngleDeg: number,
  separationDeg: number,
  moonAltDeg: number,
  targetAltDeg: number,
  k = DEFAULT_EXTINCTION_K,
): number {
  if (moonAltDeg <= 0 || targetAltDeg <= 0) return 0;
  const zm = 90 - moonAltDeg;
  const z = 90 - targetAltDeg;
  const istar = moonIlluminanceKs(phaseAngleDeg);
  const f = moonScatteringKs(separationDeg);
  return (
    f * istar * Math.pow(10, -0.4 * k * ksAirmass(zm)) * (1 - Math.pow(10, -0.4 * k * ksAirmass(z)))
  );
}

/**
 * Sky brightening in magnitudes caused by the Moon, relative to the given
 * moonless background brightness (nL): Δm = 2.5 log10((B + B_moon) / B).
 */
export function moonBrighteningMag(backgroundNl: number, moonNl: number): number {
  if (!(backgroundNl > 0)) return 0;
  return 2.5 * Math.log10((backgroundNl + moonNl) / backgroundNl);
}
