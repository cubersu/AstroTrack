import { pinOptics } from '../../astro/equipment';
import type { RigInput } from '../../astro/scoring';

/** The user's override of the engine's optics choice on a target page. */
export interface OpticsSelection {
  opticsId: string;
  /** Effective focal length (mm); null lets the engine frame within a zoom's range. */
  focalLengthMm: number | null;
  /** Effective f-number; null = automatic working aperture. */
  fNumber: number | null;
}

/**
 * Restrict the rig to the selected optic, pinned to the chosen focal length
 * and aperture, so the evaluation (framing, NPF/tracking limits, sub-exposure,
 * integration, scores) describes exactly that configuration. An unknown optic
 * (e.g. after switching profiles) falls back to the automatic choice.
 */
export function applyOpticsSelection(rig: RigInput, sel: OpticsSelection | null): RigInput {
  if (!sel) return rig;
  const o = rig.optics.find((x) => x.id === sel.opticsId);
  if (!o) return rig;
  return {
    ...rig,
    optics: [{ id: o.id, spec: pinOptics(o.spec, sel.focalLengthMm, sel.fNumber) }],
  };
}

export function selectionKey(sel: OpticsSelection | null): string {
  return sel ? `${sel.opticsId}|${sel.focalLengthMm ?? ''}|${sel.fNumber ?? ''}` : '';
}
