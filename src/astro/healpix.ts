/**
 * Minimal HEALPix (Górski et al. 2005) implementation, NESTED scheme only,
 * used for spatial tiling of star catalogues. Ported from the reference
 * algorithms in HEALPix C++ (healpix_base: loc2pix / pix2loc).
 *
 * Gaia source_id encodes the level-12 nested HEALPix index in its top bits:
 *   hpx12 = floor(source_id / 2^35)
 */

const TWOTHIRD = 2 / 3;
const HALFPI = Math.PI / 2;
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];

export function nsideForOrder(order: number): number {
  return 1 << order;
}

export function npix(nside: number): number {
  return 12 * nside * nside;
}

/** Interleave the bits of x (even positions) and y (odd positions). */
function spread(v: number): number {
  // Works for v < 2^15 (order ≤ 15), sufficient for our tilings.
  let r = 0;
  for (let i = 0; i < 15; i++) if (v & (1 << i)) r |= 1 << (2 * i);
  return r;
}

function compress(v: number): number {
  let r = 0;
  for (let i = 0; i < 15; i++) if (v & (1 << (2 * i))) r |= 1 << i;
  return r;
}

function xyf2nest(ix: number, iy: number, face: number, nside: number): number {
  return face * nside * nside + spread(ix) + 2 * spread(iy);
}

function nest2xyf(pix: number, nside: number): { ix: number; iy: number; face: number } {
  const npface = nside * nside;
  const face = Math.floor(pix / npface);
  const p = pix - face * npface;
  return { ix: compress(p), iy: compress(Math.floor(p / 2)) & (nside - 1) & 0x7fff, face };
}

/** Nested pixel index for colatitude θ (rad) and longitude φ (rad). */
export function ang2pixNest(nside: number, theta: number, phi: number): number {
  const z = Math.cos(theta);
  const za = Math.abs(z);
  let tt = (phi / HALFPI) % 4;
  if (tt < 0) tt += 4;
  if (za <= TWOTHIRD) {
    const temp1 = nside * (0.5 + tt);
    const temp2 = nside * z * 0.75;
    const jp = Math.floor(temp1 - temp2);
    const jm = Math.floor(temp1 + temp2);
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    const face = ifp === ifm ? ifp | 4 : ifp < ifm ? ifp : ifm + 8;
    const ix = jm & (nside - 1);
    const iy = nside - (jp & (nside - 1)) - 1;
    return xyf2nest(ix, iy, face, nside);
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = nside * Math.sqrt(3 * (1 - za));
  const jp = Math.min(Math.floor(tp * tmp), nside - 1);
  const jm = Math.min(Math.floor((1 - tp) * tmp), nside - 1);
  return z > 0
    ? xyf2nest(nside - jm - 1, nside - jp - 1, ntt, nside)
    : xyf2nest(jp, jm, ntt + 8, nside);
}

/** Centre of a nested pixel as (θ, φ) in radians. */
export function pix2angNest(nside: number, pix: number): { theta: number; phi: number } {
  const { ix, iy, face } = nest2xyf(pix, nside);
  const npixTotal = npix(nside);
  const fact2 = 4 / npixTotal;
  const fact1 = (nside << 1) * fact2;
  const jr = JRLL[face] * nside - ix - iy - 1;
  let nr: number;
  let z: number;
  let kshift: number;
  if (jr < nside) {
    nr = jr;
    z = 1 - nr * nr * fact2;
    kshift = 0;
  } else if (jr > 3 * nside) {
    nr = 4 * nside - jr;
    z = nr * nr * fact2 - 1;
    kshift = 0;
  } else {
    nr = nside;
    z = (2 * nside - jr) * fact1;
    kshift = (jr - nside) & 1;
  }
  let jp = (JPLL[face] * nr + ix - iy + 1 + kshift) / 2;
  if (jp > 4 * nside) jp -= 4 * nside;
  if (jp < 1) jp += 4 * nside;
  const phi = (jp - (kshift + 1) * 0.5) * (HALFPI / nr);
  return { theta: Math.acos(Math.max(-1, Math.min(1, z))), phi };
}

const DEG = Math.PI / 180;

export function radecToPix(nside: number, raDeg: number, decDeg: number): number {
  return ang2pixNest(nside, (90 - decDeg) * DEG, raDeg * DEG);
}

export function pixToRadec(nside: number, pix: number): { raDeg: number; decDeg: number } {
  const { theta, phi } = pix2angNest(nside, pix);
  return { raDeg: (((phi / DEG) % 360) + 360) % 360, decDeg: 90 - theta / DEG };
}

/**
 * Conservative upper bound (degrees) of the distance from a pixel centre to
 * any point in the pixel. HEALPix pixels are equal-area but not equal-shape;
 * a factor of 1.5 × the square root of the pixel area safely bounds the
 * worst-case (polar-cap corner) pixels.
 */
export function maxPixelRadiusDeg(nside: number): number {
  const areaSr = (4 * Math.PI) / npix(nside);
  return (1.5 * Math.sqrt(areaSr)) / DEG;
}

/** All pixels whose area may intersect a disc (may include a few extra). */
export function queryDiscInclusive(
  nside: number,
  raDeg: number,
  decDeg: number,
  radiusDeg: number,
): number[] {
  const out: number[] = [];
  const lim = radiusDeg + maxPixelRadiusDeg(nside);
  const cosLim = Math.cos(Math.min(lim, 180) * DEG);
  const r0 = raDeg * DEG;
  const d0 = decDeg * DEG;
  const x0 = Math.cos(d0) * Math.cos(r0);
  const y0 = Math.cos(d0) * Math.sin(r0);
  const z0 = Math.sin(d0);
  const n = npix(nside);
  for (let p = 0; p < n; p++) {
    const { theta, phi } = pix2angNest(nside, p);
    const st = Math.sin(theta);
    const dot = x0 * st * Math.cos(phi) + y0 * st * Math.sin(phi) + z0 * Math.cos(theta);
    if (dot >= cosLim) out.push(p);
  }
  return out;
}

/** HEALPix level-12 nested index encoded in a Gaia source_id (as bigint). */
export function gaiaSourceIdToHpx12(sourceId: bigint): number {
  return Number(sourceId >> 35n);
}

/** Degrade a nested index from order `from` to a coarser order `to`. */
export function degradeNest(pix: number, from: number, to: number): number {
  return Math.floor(pix / 4 ** (from - to));
}
