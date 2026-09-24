import { describe, expect, it } from 'vitest';
import * as A from 'astronomy-engine';
import {
  calendarToJd,
  cometPosition,
  heliocentricEquatorial,
  parseMpcCometFile,
  parseMpcCometLine,
} from './comets';
import type { CometElements } from './comets';
import { msToJd } from './time';

function col(s: string, width: number, right = true): string {
  return right ? s.padStart(width) : s.padEnd(width);
}

/** Build a line in MPC one-line comet format from values (for parser tests). */
function mpcLine(v: {
  y: number;
  m: number;
  d: number;
  q: number;
  e: number;
  w: number;
  node: number;
  i: number;
  H: number;
  G: number;
  name: string;
}): string {
  let s = '    C' + col('', 7, false) + '  ';
  s +=
    col(String(v.y), 4) + ' ' + col(String(v.m).padStart(2, '0'), 2) + ' ' + col(v.d.toFixed(4), 7);
  s += ' ' + col(v.q.toFixed(6), 9) + '  ' + col(v.e.toFixed(6), 8) + '  ' + col(v.w.toFixed(4), 8);
  s += '  ' + col(v.node.toFixed(4), 8) + '  ' + col(v.i.toFixed(4), 8) + '  ' + '20260101';
  s +=
    '  ' +
    col(v.H.toFixed(1), 4) +
    ' ' +
    col(v.G.toFixed(1), 4) +
    '  ' +
    col(v.name, 56, false) +
    ' MPC 12345';
  return s;
}

describe('MPC comet elements', () => {
  it('parses fixed-width lines', () => {
    const line = mpcLine({
      y: 2024,
      m: 4,
      d: 21.1383,
      q: 0.780914,
      e: 0.954597,
      w: 198.987,
      node: 255.8561,
      i: 74.192,
      H: 5,
      G: 6,
      name: '12P/Pons-Brooks',
    });
    const c = parseMpcCometLine(line)!;
    expect(c).not.toBeNull();
    expect(c.designation).toBe('12P/Pons-Brooks');
    expect(c.qAu).toBeCloseTo(0.780914, 6);
    expect(c.e).toBeCloseTo(0.954597, 6);
    expect(c.inclDeg).toBeCloseTo(74.192, 4);
    expect(c.H).toBe(5);
    expect(c.perihelionJd).toBeCloseTo(calendarToJd(2024, 4, 21.1383), 6);
  });
  it('skips malformed lines', () => {
    const { comets, skipped } = parseMpcCometFile('garbage\n\n' + 'x'.repeat(120));
    expect(comets).toHaveLength(0);
    expect(skipped).toBe(2);
  });
});

describe('Keplerian propagation', () => {
  // Earth–Moon barycentre mean elements at J2000 (JPL approximate elements):
  // a = 1.00000261, e = 0.01671123, ϖ = 102.93768193°, L = 100.46457166°.
  const a = 1.00000261;
  const e = 0.01671123;
  const n = 0.01720209895 / Math.pow(a, 1.5); // rad/day
  const M0 = ((100.46457166 - 102.93768193) * Math.PI) / 180;
  const earthLike: CometElements = {
    designation: 'EMB test',
    perihelionJd: 2451545.0 - M0 / n,
    qAu: a * (1 - e),
    e,
    argPeriDeg: 102.93768193,
    nodeDeg: 0,
    inclDeg: 0,
    epoch: null,
    H: null,
    G: null,
  };
  it('reproduces Earth’s heliocentric position within ~0.01 AU over years', () => {
    for (const iso of ['2000-03-01', '2003-07-15', '2010-11-02']) {
      const ms = Date.parse(iso + 'T00:00:00Z');
      const mine = heliocentricEquatorial(earthLike, msToJd(ms));
      const ref = A.HelioVector(A.Body.Earth, new Date(ms));
      const err = Math.hypot(mine[0] - ref.x, mine[1] - ref.y, mine[2] - ref.z);
      expect(err).toBeLessThan(0.01);
    }
  });
  it('handles parabolic and hyperbolic orbits and predicts magnitudes', () => {
    const base = { ...earthLike, H: 8, G: 4, qAu: 0.5, inclDeg: 40, nodeDeg: 80, argPeriDeg: 120 };
    const t = Date.UTC(2026, 5, 1);
    for (const ecc of [0.9, 1, 1.05]) {
      const p = cometPosition({ ...base, e: ecc, perihelionJd: msToJd(t) + 20 }, t);
      expect(p.rAu).toBeGreaterThan(0.5);
      expect(Number.isFinite(p.raDeg)).toBe(true);
      expect(p.magnitude).not.toBeNull();
    }
    // At perihelion r = q.
    const atPeri = cometPosition({ ...base, e: 1, perihelionJd: msToJd(t) }, t);
    expect(atPeri.rAu).toBeCloseTo(0.5, 2);
  });
});
