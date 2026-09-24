/**
 * Approximate zenith sky-brightness model from satellite night-light radiance.
 *
 * This is an ESTIMATION pipeline for offline packs, not a radiative-transfer
 * model. It is documented in docs/offline-data.md and every value it
 * produces is labelled "estimate" in the app.
 *
 * 1. Upward radiance L (VIIRS DNB annual composite, nW·cm⁻²·sr⁻¹) is averaged
 *    onto the output grid.
 * 2. Artificial skyglow at a site is approximated by a radially decaying sum
 *    over surrounding sources (Walker's law, sky brightness ∝ d^−2.5, with an
 *    exponential cut-off for atmospheric extinction at large distances):
 *        I(site) = Σ_j L_j · A_j · (d_j + d0)^−2.5 · exp(−d_j / λ)
 *    with d0 = 1 km, λ = 100 km, sources up to 150 km (two-scale evaluation).
 * 3. The artificial-to-natural brightness ratio is taken as C · I; with a
 *    natural sky of 22.0 mag/arcsec²:
 *        SQM = 22.0 − 2.5 · log10(1 + C · I)
 *    C is fitted to local SQM measurements when a calibration file is given
 *    (least squares in log space); otherwise a documented default is used and
 *    the pack is marked "uncalibrated".
 *
 * References: Walker, M. F. (1977) PASP 89, 405; Garstang, R. H. (1986)
 * PASP 98, 364; Falchi, F. et al. (2016) Sci. Adv. 2, e1600377 (for context).
 */

export const NATURAL_SQM = 22.0;
export const DEFAULT_C = 0.2;
export const KERNEL = {
  d0Km: 1,
  lambdaKm: 100,
  fineRadiusKm: 30,
  coarseRadiusKm: 150,
  exponent: 2.5,
};
const KM_PER_DEG = 111.195;

export interface Raster {
  width: number;
  height: number;
  west: number;
  south: number;
  east: number;
  north: number;
  /** Row-major, first row = northernmost. NaN = no data. */
  data: Float32Array;
}

export interface Region {
  name: string;
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Area-average a raster onto a regular lat/lon grid covering `region` at `resDeg`. */
export function resample(r: Raster, region: Omit<Region, 'name'>, resDeg: number): Raster {
  const width = Math.round((region.east - region.west) / resDeg);
  const height = Math.round((region.north - region.south) / resDeg);
  const out = new Float32Array(width * height);
  const cnt = new Uint32Array(width * height);
  const cw = (r.east - r.west) / r.width;
  const ch = (r.north - r.south) / r.height;
  for (let y = 0; y < r.height; y++) {
    const lat = r.north - (y + 0.5) * ch;
    if (lat < region.south || lat >= region.north) continue;
    const oy = Math.floor((region.north - lat) / resDeg);
    for (let x = 0; x < r.width; x++) {
      const lon = r.west + (x + 0.5) * cw;
      if (lon < region.west || lon >= region.east) continue;
      const v = r.data[y * r.width + x];
      if (!Number.isFinite(v)) continue;
      const ox = Math.floor((lon - region.west) / resDeg);
      const k = oy * width + ox;
      out[k] += Math.max(0, v);
      cnt[k]++;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] = cnt[i] ? out[i] / cnt[i] : Number.NaN;
  return { width, height, ...region, data: out };
}

function weight(dKm: number): number {
  return Math.pow(dKm + KERNEL.d0Km, -KERNEL.exponent) * Math.exp(-dKm / KERNEL.lambdaKm);
}

/** Convolve radiance with the skyglow kernel within [rMin, rMax) km. */
function convolveRing(g: Raster, rMinKm: number, rMaxKm: number): Float32Array {
  const res = (g.east - g.west) / g.width;
  const out = new Float32Array(g.width * g.height);
  const latMid = (g.north + g.south) / 2;
  const dyKm = res * KM_PER_DEG;
  const dxKm = res * KM_PER_DEG * Math.cos((latMid * Math.PI) / 180);
  const ry = Math.ceil(rMaxKm / dyKm);
  const rx = Math.ceil(rMaxKm / dxKm);
  const offsets: Array<[number, number, number]> = [];
  for (let j = -ry; j <= ry; j++)
    for (let i = -rx; i <= rx; i++) {
      const d = Math.hypot(i * dxKm, j * dyKm);
      if (d >= rMinKm && d < rMaxKm) offsets.push([i, j, weight(d) * dxKm * dyKm]);
    }
  for (let y = 0; y < g.height; y++) {
    for (let x = 0; x < g.width; x++) {
      const L = g.data[y * g.width + x];
      if (!(L > 0)) continue;
      // Scatter the source's contribution to all sites within range.
      for (const [i, j, w] of offsets) {
        const xx = x + i;
        const yy = y + j;
        if (xx < 0 || yy < 0 || xx >= g.width || yy >= g.height) continue;
        out[yy * g.width + xx] += L * w;
      }
    }
  }
  return out;
}

/** Downsample by an integer factor (mean of finite values). */
function downsample(g: Raster, f: number): Raster {
  const width = Math.ceil(g.width / f);
  const height = Math.ceil(g.height / f);
  const data = new Float32Array(width * height);
  const cnt = new Uint32Array(width * height);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const v = g.data[y * g.width + x];
      if (!Number.isFinite(v)) continue;
      const k = Math.floor(y / f) * width + Math.floor(x / f);
      data[k] += v;
      cnt[k]++;
    }
  for (let i = 0; i < data.length; i++) data[i] = cnt[i] ? data[i] / cnt[i] : 0;
  const res = (g.east - g.west) / g.width;
  return {
    ...g,
    width,
    height,
    east: g.west + width * res * f,
    south: g.north - height * res * f,
    data,
  };
}

/**
 * Skyglow index I per cell using a two-scale evaluation: full resolution up
 * to fineRadiusKm, a coarser grid beyond (bilinear-free nearest upsampling is
 * adequate because the far-field kernel varies slowly).
 */
export function skyglowIndex(g: Raster): Float32Array {
  const res = (g.east - g.west) / g.width;
  const fine = convolveRing(g, 0, KERNEL.fineRadiusKm);
  const factor = Math.max(1, Math.round(5 / (res * KM_PER_DEG)));
  if (factor <= 1) {
    const far = convolveRing(g, KERNEL.fineRadiusKm, KERNEL.coarseRadiusKm);
    return fine.map((v, i) => v + far[i]);
  }
  const coarse = downsample(g, factor);
  const far = convolveRing(coarse, KERNEL.fineRadiusKm, KERNEL.coarseRadiusKm);
  const out = new Float32Array(fine.length);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const cy = Math.min(coarse.height - 1, Math.floor(y / factor));
      const cx = Math.min(coarse.width - 1, Math.floor(x / factor));
      out[y * g.width + x] = fine[y * g.width + x] + far[cy * coarse.width + cx];
    }
  return out;
}

export function indexToSqm(index: number, c: number = DEFAULT_C, natural = NATURAL_SQM): number {
  return natural - 2.5 * Math.log10(1 + c * Math.max(0, index));
}

export interface CalibrationPoint {
  index: number;
  sqm: number;
}

/** Fit C in SQM = natural − 2.5 log10(1 + C·I) by least squares in log space. */
export function fitCalibration(points: CalibrationPoint[], natural = NATURAL_SQM): number | null {
  const logs: number[] = [];
  for (const p of points) {
    const ratio = Math.pow(10, 0.4 * (natural - p.sqm)) - 1;
    if (ratio > 0 && p.index > 0) logs.push(Math.log(ratio / p.index));
  }
  if (logs.length === 0) return null;
  return Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
}
