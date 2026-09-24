/**
 * Relative optical air mass.
 *
 * Kasten, F. & Young, A. T. (1989), "Revised optical air mass tables and
 * approximation formula", Applied Optics 28(22), 4735–4738:
 *
 *   X = 1 / (cos Z + 0.50572 · (96.07995° − Z)^−1.6364),  Z = 90° − h (degrees)
 *
 * Accurate to better than 0.5% up to Z ≈ 90°. Returns +Infinity below the horizon.
 */
export function airmass(altDeg: number): number {
  if (altDeg <= 0) return Number.POSITIVE_INFINITY;
  const z = 90 - altDeg;
  return 1 / (Math.cos((z * Math.PI) / 180) + 0.50572 * Math.pow(96.07995 - z, -1.6364));
}

/** Inverse: altitude (degrees) at which the Kasten–Young air mass equals X (X ≥ 1). */
export function altitudeForAirmass(x: number): number {
  if (x <= 1) return 90;
  let lo = 0.0001;
  let hi = 90;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (airmass(mid) > x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
