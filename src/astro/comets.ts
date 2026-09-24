/**
 * Comets from Minor Planet Center one-line orbital elements (CometEls.txt).
 * Positions are computed locally with two-body Keplerian propagation
 * (elliptic, parabolic and hyperbolic orbits) and light-time correction.
 * Planetary perturbations are ignored, so accuracy degrades far from the
 * element epoch — elements should be refreshed periodically (the UI shows
 * the last update date).
 *
 * MPC one-line comet format (columns, 1-based):
 *   15–18 perihelion year, 20–21 month, 23–29 day (TT)
 *   31–39 q (AU), 42–49 e, 52–59 ω, 62–69 Ω, 72–79 i (J2000 ecliptic, deg)
 *   82–89 epoch (YYYYMMDD), 92–95 absolute magnitude H, 97–100 slope G
 *   103–158 designation and name
 * Predicted total magnitude: m = H + 5·log10(Δ) + 2.5·G·log10(r)
 * (comet brightness predictions are notoriously uncertain).
 */
import { earthHelioAu } from './ephemeris';
import { fromVector } from './coordinates';
import type { Equatorial } from './coordinates';
import { DEG2RAD } from './units';
import { jdToMs, msToJd } from './time';

export const GAUSS_K = 0.01720209895;
export const OBLIQUITY_J2000_DEG = 23.4392911;
export const C_AU_PER_DAY = 173.1446327;

export interface CometElements {
  designation: string;
  perihelionJd: number;
  qAu: number;
  e: number;
  argPeriDeg: number;
  nodeDeg: number;
  inclDeg: number;
  epoch: string | null;
  H: number | null;
  G: number | null;
}

function num(s: string): number {
  const t = s.trim();
  return t === '' ? Number.NaN : Number(t);
}

/** Julian date from a calendar date with fractional day (TT ≈ UTC here). */
export function calendarToJd(year: number, month: number, day: number): number {
  const d = Math.floor(day);
  const frac = day - d;
  return msToJd(Date.UTC(year, month - 1, d)) + frac;
}

export function parseMpcCometLine(line: string): CometElements | null {
  if (line.length < 100) return null;
  const year = num(line.slice(14, 18));
  const month = num(line.slice(19, 21));
  const day = num(line.slice(22, 29));
  const q = num(line.slice(30, 39));
  const e = num(line.slice(41, 49));
  const w = num(line.slice(51, 59));
  const node = num(line.slice(61, 69));
  const incl = num(line.slice(71, 79));
  const epoch = line.slice(81, 89).trim() || null;
  const H = num(line.slice(91, 95));
  const G = num(line.slice(96, 100));
  const name = line.slice(102, 158).trim();
  if ([year, month, day, q, e, w, node, incl].some((v) => !Number.isFinite(v))) return null;
  if (!(q > 0) || e < 0 || !name) return null;
  return {
    designation: name,
    perihelionJd: calendarToJd(year, month, day),
    qAu: q,
    e,
    argPeriDeg: w,
    nodeDeg: node,
    inclDeg: incl,
    epoch,
    H: Number.isFinite(H) ? H : null,
    G: Number.isFinite(G) ? G : null,
  };
}

export function parseMpcCometFile(text: string): { comets: CometElements[]; skipped: number } {
  const comets: CometElements[] = [];
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const c = parseMpcCometLine(raw);
    if (c) comets.push(c);
    else skipped++;
  }
  return { comets, skipped };
}

/** Solve Kepler's equation E − e sin E = M (elliptic). */
function solveElliptic(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI * Math.sign(Math.sin(M)) || M;
  for (let i = 0; i < 100; i++) {
    const f = E - e * Math.sin(E) - M;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Solve e sinh H − H = M (hyperbolic). */
function solveHyperbolic(M: number, e: number): number {
  let H = Math.asinh(M / e);
  for (let i = 0; i < 100; i++) {
    const f = e * Math.sinh(H) - H - M;
    const d = f / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return H;
}

/** True anomaly (rad) and heliocentric distance (AU) at a Julian date. */
export function anomalyAndRadius(c: CometElements, jd: number): { nu: number; r: number } {
  const dt = jd - c.perihelionJd;
  const e = c.e;
  const q = c.qAu;
  if (Math.abs(e - 1) < 1e-6) {
    const W = ((3 * GAUSS_K) / Math.sqrt(2 * q * q * q)) * dt;
    const Y = Math.cbrt(W / 2 + Math.sqrt((W * W) / 4 + 1));
    const s = Y - 1 / Y;
    return { nu: 2 * Math.atan(s), r: q * (1 + s * s) };
  }
  if (e < 1) {
    const a = q / (1 - e);
    const n = GAUSS_K / Math.pow(a, 1.5);
    let M = (n * dt) % (2 * Math.PI);
    if (M > Math.PI) M -= 2 * Math.PI;
    if (M < -Math.PI) M += 2 * Math.PI;
    const E = solveElliptic(M, e);
    const nu =
      2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    return { nu, r: a * (1 - e * Math.cos(E)) };
  }
  const a = q / (e - 1);
  const n = GAUSS_K / Math.pow(a, 1.5);
  const Hh = solveHyperbolic(n * dt, e);
  const nu = 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(Hh / 2));
  return { nu, r: a * (e * Math.cosh(Hh) - 1) };
}

/** Heliocentric J2000 equatorial position (AU). */
export function heliocentricEquatorial(c: CometElements, jd: number): [number, number, number] {
  const { nu, r } = anomalyAndRadius(c, jd);
  const O = c.nodeDeg * DEG2RAD;
  const i = c.inclDeg * DEG2RAD;
  const u = c.argPeriDeg * DEG2RAD + nu;
  const x = r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i));
  const y = r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i));
  const z = r * Math.sin(u) * Math.sin(i);
  const eps = OBLIQUITY_J2000_DEG * DEG2RAD;
  return [x, y * Math.cos(eps) - z * Math.sin(eps), y * Math.sin(eps) + z * Math.cos(eps)];
}

export interface CometPosition extends Equatorial {
  /** Heliocentric distance r (AU). */
  rAu: number;
  /** Geocentric distance Δ (AU). */
  deltaAu: number;
  /** Solar elongation (deg). */
  elongationDeg: number;
  /** Predicted total magnitude, or null when H/G are missing. */
  magnitude: number | null;
}

/** Astrometric geocentric J2000 position with one light-time iteration. */
export function cometPosition(c: CometElements, ms: number): CometPosition {
  const jd = msToJd(ms);
  const earth = earthHelioAu(ms);
  let p = heliocentricEquatorial(c, jd);
  let g: [number, number, number] = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
  const delta0 = Math.hypot(...g);
  p = heliocentricEquatorial(c, jd - delta0 / C_AU_PER_DAY);
  g = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]];
  const delta = Math.hypot(...g);
  const r = Math.hypot(...p);
  const eq = fromVector(g);
  const rEarth = Math.hypot(...earth);
  // Elongation from the Sun–Earth–comet triangle.
  const cosE = (rEarth * rEarth + delta * delta - r * r) / (2 * rEarth * delta);
  const magnitude =
    c.H !== null ? c.H + 5 * Math.log10(delta) + 2.5 * (c.G ?? 4) * Math.log10(r) : null;
  return {
    raDeg: eq.raDeg,
    decDeg: eq.decDeg,
    rAu: r,
    deltaAu: delta,
    elongationDeg: (Math.acos(Math.max(-1, Math.min(1, cosE))) * 180) / Math.PI,
    magnitude,
  };
}

export function perihelionMs(c: CometElements): number {
  return jdToMs(c.perihelionJd);
}
