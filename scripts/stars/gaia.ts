/**
 * Pure helpers for the Gaia DR3 deep-star pack builder (unit-tested).
 * Gaia source_id encodes the level-12 nested HEALPix index: hpx12 = source_id >> 35.
 */

/** source_id range [lo, hi) covering a nested HEALPix tile at `order`. */
export function sourceIdRange(tile: number, order: number): [bigint, bigint] {
  const shift = BigInt(2 * (12 - order));
  const lo = (BigInt(tile) << shift) << 35n;
  const hi = ((BigInt(tile) + 1n) << shift) << 35n;
  return [lo, hi];
}

export function tileAdql(tile: number, order: number, gMin: number, gMax: number): string {
  const [lo, hi] = sourceIdRange(tile, order);
  return (
    'SELECT source_id, ra, dec, phot_g_mean_mag, bp_rp, pmra, pmdec ' +
    'FROM gaiadr3.gaia_source ' +
    `WHERE source_id >= ${lo} AND source_id < ${hi} ` +
    `AND phot_g_mean_mag > ${gMin} AND phot_g_mean_mag <= ${gMax}`
  );
}

/**
 * Propagate a Gaia DR3 position (epoch J2016.0) to epoch J2000.0 with linear
 * proper motion. pmra is μα* = μα·cos δ (mas/yr).
 */
export function toEpoch2000(
  raDeg: number,
  decDeg: number,
  pmraMasYr: number | null,
  pmdecMasYr: number | null,
): [number, number] {
  if (pmraMasYr == null || pmdecMasYr == null) return [raDeg, decDeg];
  const dt = -16; // years
  const dDec = (pmdecMasYr * dt) / 3.6e6;
  const cosd = Math.cos((decDeg * Math.PI) / 180);
  const dRa = cosd > 1e-6 ? (pmraMasYr * dt) / 3.6e6 / cosd : 0;
  return [(((raDeg + dRa) % 360) + 360) % 360, decDeg + dDec];
}
