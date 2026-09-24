/**
 * Surface-brightness resolution for catalogue objects.
 *
 * Priority:
 *  1. catalogue value (e.g. OpenNGC "SurfBr", mean B-band SB within the 25
 *     mag/arcsec² isophote for galaxies) converted to V with a type-typical
 *     B−V colour → basis 'catalogue'
 *  2. derived from total magnitude and angular size:
 *        SB = m + 2.5·log10(π/4 · a · b)   (a, b in arcsec; uniform ellipse)
 *     → basis 'derived' (always flagged as estimated)
 *  3. type-typical assumption → basis 'assumed' (lowers confidence)
 */
import type { DsoType } from './objectTypes';
import { B_MINUS_V, DEFAULT_B_MINUS_V, TYPE_PROFILES } from './objectTypes';

export type SbBasis = 'catalogue' | 'derived' | 'assumed' | 'none';

export interface SbInput {
  type: DsoType;
  magV?: number | null;
  magB?: number | null;
  majorArcmin?: number | null;
  minorArcmin?: number | null;
  sbCatalogue?: number | null;
  sbBand?: 'B' | 'V' | null;
}

export interface SbResult {
  sbV: number;
  basis: SbBasis;
}

export function bMinusV(type: DsoType): number {
  return B_MINUS_V[type] ?? DEFAULT_B_MINUS_V;
}

/** Best available V magnitude (V directly, else B − (B−V)). */
export function resolveMagV(inp: SbInput): { magV: number | null; fromB: boolean } {
  if (inp.magV != null && Number.isFinite(inp.magV)) return { magV: inp.magV, fromB: false };
  if (inp.magB != null && Number.isFinite(inp.magB))
    return { magV: inp.magB - bMinusV(inp.type), fromB: true };
  return { magV: null, fromB: false };
}

export function deriveSurfaceBrightness(
  mag: number,
  majorArcmin: number,
  minorArcmin?: number | null,
): number {
  const a = majorArcmin * 60;
  const b = (minorArcmin && minorArcmin > 0 ? minorArcmin : majorArcmin) * 60;
  return mag + 2.5 * Math.log10((Math.PI / 4) * a * b);
}

export function resolveSurfaceBrightness(inp: SbInput): SbResult {
  if (inp.sbCatalogue != null && Number.isFinite(inp.sbCatalogue)) {
    const v = inp.sbBand === 'V' ? inp.sbCatalogue : inp.sbCatalogue - bMinusV(inp.type);
    return { sbV: v, basis: 'catalogue' };
  }
  const { magV } = resolveMagV(inp);
  if (magV != null && inp.majorArcmin != null && inp.majorArcmin > 0) {
    return {
      sbV: deriveSurfaceBrightness(magV, inp.majorArcmin, inp.minorArcmin),
      basis: 'derived',
    };
  }
  return { sbV: TYPE_PROFILES[inp.type].assumedSurfaceBrightness, basis: 'assumed' };
}
