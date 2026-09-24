/**
 * Explanation primitives. The engine emits language-neutral reason codes with
 * numeric parameters; the UI renders them through the i18n layer.
 */
import type { AstroComponent } from './config';

export type ReasonPolarity = 'positive' | 'negative' | 'info';

export type ReasonCode =
  | 'altitude.high'
  | 'altitude.medium'
  | 'altitude.low'
  | 'altitude.airmass'
  | 'framing.excellent'
  | 'framing.good'
  | 'framing.small'
  | 'framing.large'
  | 'framing.mosaic'
  | 'framing.sizeUnknown'
  | 'moon.down'
  | 'moon.farDim'
  | 'moon.moderate'
  | 'moon.bright'
  | 'moon.close'
  | 'lp.dark'
  | 'lp.moderate'
  | 'lp.bright'
  | 'lp.assumed'
  | 'lp.filterHelps'
  | 'duration.long'
  | 'duration.ok'
  | 'duration.short'
  | 'access.bright'
  | 'access.moderate'
  | 'access.faint'
  | 'access.darkNebula'
  | 'access.unknown'
  | 'camera.stockEmission'
  | 'camera.stockEmissionFiltered'
  | 'camera.goodMatch'
  | 'filter.chosen'
  | 'filter.unknownCustom'
  | 'tracking.fixedShort'
  | 'tracking.fixedOk'
  | 'tracking.limited'
  | 'tracking.ok'
  | 'tracking.uncalibrated'
  | 'hard.neverRises'
  | 'hard.belowMinAltitude'
  | 'hard.noDarkness'
  | 'hard.tooSmall'
  | 'hard.tooLarge'
  | 'hard.noOptics'
  | 'hard.notScored'
  | 'hard.nowPassed';

export interface Reason {
  code: ReasonCode;
  polarity: ReasonPolarity;
  component?: AstroComponent | 'hard';
  /** Relative importance used for ordering (higher first). */
  weight: number;
  params?: Record<string, number | string>;
}

export function sortReasons(reasons: Reason[]): Reason[] {
  return [...reasons].sort((a, b) => b.weight - a.weight);
}

export function positives(reasons: Reason[]): Reason[] {
  return sortReasons(reasons.filter((r) => r.polarity === 'positive'));
}

export function negatives(reasons: Reason[]): Reason[] {
  return sortReasons(reasons.filter((r) => r.polarity === 'negative'));
}
