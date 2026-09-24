/**
 * HYG v4.1 → core star file (bright stars, bundled) + deep tiles (optional pack).
 * The Sun (id 0) is removed. Positions are J2000 as given by HYG (epoch 2000).
 */
import type { StarRowInput } from '../../src/catalog/format';

export interface HygStar extends StarRowInput {
  proper: string | null;
  bayer: string | null;
  flam: string | null;
  con: string | null;
  hip: number | null;
}

export function parseHygRows(rows: Array<Record<string, string>>): HygStar[] {
  const out: HygStar[] = [];
  for (const r of rows) {
    if (r['id'] === '0' || r['proper'] === 'Sol') continue;
    const ra = Number(r['ra']);
    const dec = Number(r['dec']);
    const mag = Number(r['mag']);
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) continue;
    const bv = r['ci'] === '' ? null : Number(r['ci']);
    out.push({
      raDeg: ra * 15,
      decDeg: dec,
      mag,
      bv: bv !== null && Number.isFinite(bv) ? bv : null,
      proper: r['proper'] || null,
      bayer: r['bayer'] || null,
      flam: r['flam'] || null,
      con: r['con'] || null,
      hip: r['hip'] ? Number(r['hip']) : null,
    });
  }
  return out;
}

/** Greek letter abbreviations used by HYG Bayer designations. */
const GREEK: Record<string, string> = {
  Alp: 'α',
  Bet: 'β',
  Gam: 'γ',
  Del: 'δ',
  Eps: 'ε',
  Zet: 'ζ',
  Eta: 'η',
  The: 'θ',
  Iot: 'ι',
  Kap: 'κ',
  Lam: 'λ',
  Mu: 'μ',
  Nu: 'ν',
  Xi: 'ξ',
  Omi: 'ο',
  Pi: 'π',
  Rho: 'ρ',
  Sig: 'σ',
  Tau: 'τ',
  Ups: 'υ',
  Phi: 'φ',
  Chi: 'χ',
  Psi: 'ψ',
  Ome: 'ω',
};

export function bayerLabel(bayer: string | null, con: string | null): string | null {
  if (!bayer || !con) return null;
  const m = /^([A-Za-z]+)(?:-?(\d))?$/.exec(bayer);
  if (!m) return null;
  const g = GREEK[m[1]] ?? m[1];
  return `${g}${m[2] ? superscript(m[2]) : ''} ${con}`;
}

function superscript(d: string): string {
  return d.replace(/[0-9]/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]);
}
