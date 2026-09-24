/**
 * Deep-sky object type taxonomy and the physical/behavioural profile of each
 * type used by the scoring engine. All numbers are centralised here and
 * documented in docs/scoring.md.
 */

export const DSO_TYPES = [
  'galaxy',
  'galaxy-group',
  'open-cluster',
  'globular-cluster',
  'emission-nebula',
  'reflection-nebula',
  'emission-reflection-nebula',
  'dark-nebula',
  'planetary-nebula',
  'supernova-remnant',
  'hii-region',
  'star-cloud',
  'cluster-nebula',
  'nebula',
  'star',
  'nonexistent',
  'other',
] as const;

export type DsoType = (typeof DSO_TYPES)[number];

/**
 * Spectral character of the light we want to record:
 *  - broadband: continuum light (galaxies, reflection nebulae)
 *  - stellar: point sources / clusters (broadband, high peak brightness)
 *  - emission: line emission (Hα, [O III], Hβ, [S II] ...)
 *  - mixed: both continuum and line emission
 *  - absorption: dark nebulae, seen against the background star field
 */
export type SpectralClass = 'broadband' | 'stellar' | 'emission' | 'mixed' | 'absorption';

export interface TypeProfile {
  /** Scored as a deep-sky imaging target. */
  scored: boolean;
  spectral: SpectralClass;
  /**
   * Exponent applied to the physical sky-background degradation factor for
   * light pollution (see lightPollution.ts). Higher = more sensitive. These
   * exponents encode practical effects not captured by the mean surface
   * brightness alone (gradients, colour casts, faint outer structure, the
   * high peak brightness of stars in clusters).
   */
  lpExponent: number;
  /** Same for moonlight (moonImpact.ts). */
  moonExponent: number;
  /**
   * Assumed mean V-band surface brightness (mag/arcsec²) when the catalogue
   * provides neither a measured surface brightness nor enough data to derive
   * one. Always flagged as an assumption and lowers confidence.
   */
  assumedSurfaceBrightness: number;
  /**
   * Reference recommended total integration (hours) for an object of this
   * type at `referenceSurfaceBrightness`, under reference conditions
   * (Bortle 4 zenith 21.1 mag/arcsec², no Moon, f/5, Hα-sensitive colour camera).
   * Empirical baseline — see docs/exposure-engine.md.
   */
  baseIntegrationH: number;
  referenceSurfaceBrightness: number;
}

export const TYPE_PROFILES: Record<DsoType, TypeProfile> = {
  galaxy: {
    scored: true,
    spectral: 'broadband',
    lpExponent: 0.5,
    moonExponent: 0.55,
    assumedSurfaceBrightness: 22.5,
    baseIntegrationH: 2,
    referenceSurfaceBrightness: 22.0,
  },
  'galaxy-group': {
    scored: true,
    spectral: 'broadband',
    lpExponent: 0.5,
    moonExponent: 0.55,
    assumedSurfaceBrightness: 22.5,
    baseIntegrationH: 3,
    referenceSurfaceBrightness: 22.0,
  },
  'open-cluster': {
    scored: true,
    spectral: 'stellar',
    lpExponent: 0.2,
    moonExponent: 0.2,
    assumedSurfaceBrightness: 21.0,
    baseIntegrationH: 0.5,
    referenceSurfaceBrightness: 21.0,
  },
  'globular-cluster': {
    scored: true,
    spectral: 'stellar',
    lpExponent: 0.3,
    moonExponent: 0.3,
    assumedSurfaceBrightness: 20.0,
    baseIntegrationH: 0.75,
    referenceSurfaceBrightness: 20.0,
  },
  'emission-nebula': {
    scored: true,
    spectral: 'emission',
    lpExponent: 0.4,
    moonExponent: 0.45,
    assumedSurfaceBrightness: 22.0,
    baseIntegrationH: 2,
    referenceSurfaceBrightness: 22.0,
  },
  'hii-region': {
    scored: true,
    spectral: 'emission',
    lpExponent: 0.4,
    moonExponent: 0.45,
    assumedSurfaceBrightness: 22.0,
    baseIntegrationH: 2,
    referenceSurfaceBrightness: 22.0,
  },
  'supernova-remnant': {
    scored: true,
    spectral: 'emission',
    lpExponent: 0.45,
    moonExponent: 0.5,
    assumedSurfaceBrightness: 23.0,
    baseIntegrationH: 3.5,
    referenceSurfaceBrightness: 23.0,
  },
  'planetary-nebula': {
    scored: true,
    spectral: 'emission',
    lpExponent: 0.5,
    moonExponent: 0.5,
    assumedSurfaceBrightness: 20.5,
    baseIntegrationH: 1,
    referenceSurfaceBrightness: 19.5,
  },
  'reflection-nebula': {
    scored: true,
    spectral: 'broadband',
    lpExponent: 0.6,
    moonExponent: 0.65,
    assumedSurfaceBrightness: 22.5,
    baseIntegrationH: 3,
    referenceSurfaceBrightness: 22.0,
  },
  'emission-reflection-nebula': {
    scored: true,
    spectral: 'mixed',
    lpExponent: 0.5,
    moonExponent: 0.55,
    assumedSurfaceBrightness: 22.0,
    baseIntegrationH: 2,
    referenceSurfaceBrightness: 22.0,
  },
  'cluster-nebula': {
    scored: true,
    spectral: 'mixed',
    lpExponent: 0.4,
    moonExponent: 0.45,
    assumedSurfaceBrightness: 21.5,
    baseIntegrationH: 1.5,
    referenceSurfaceBrightness: 21.5,
  },
  nebula: {
    scored: true,
    spectral: 'mixed',
    lpExponent: 0.5,
    moonExponent: 0.55,
    assumedSurfaceBrightness: 22.5,
    baseIntegrationH: 2.5,
    referenceSurfaceBrightness: 22.0,
  },
  'dark-nebula': {
    scored: true,
    spectral: 'absorption',
    lpExponent: 0.7,
    moonExponent: 0.75,
    assumedSurfaceBrightness: 22.5,
    baseIntegrationH: 4,
    referenceSurfaceBrightness: 22.5,
  },
  'star-cloud': {
    scored: true,
    spectral: 'stellar',
    lpExponent: 0.3,
    moonExponent: 0.3,
    assumedSurfaceBrightness: 21.0,
    baseIntegrationH: 0.75,
    referenceSurfaceBrightness: 21.0,
  },
  star: {
    scored: false,
    spectral: 'stellar',
    lpExponent: 0,
    moonExponent: 0,
    assumedSurfaceBrightness: 20,
    baseIntegrationH: 0,
    referenceSurfaceBrightness: 20,
  },
  nonexistent: {
    scored: false,
    spectral: 'broadband',
    lpExponent: 0,
    moonExponent: 0,
    assumedSurfaceBrightness: 25,
    baseIntegrationH: 0,
    referenceSurfaceBrightness: 25,
  },
  other: {
    scored: false,
    spectral: 'broadband',
    lpExponent: 0.5,
    moonExponent: 0.55,
    assumedSurfaceBrightness: 22.5,
    baseIntegrationH: 3,
    referenceSurfaceBrightness: 22,
  },
};

/** Typical B−V colour used to convert a B-band surface brightness to V. */
export const B_MINUS_V: Partial<Record<DsoType, number>> = {
  galaxy: 0.8,
  'galaxy-group': 0.8,
  'open-cluster': 0.4,
  'globular-cluster': 0.7,
  'reflection-nebula': 0.3,
};
export const DEFAULT_B_MINUS_V = 0.5;

export function isScoredType(t: DsoType): boolean {
  return TYPE_PROFILES[t].scored;
}
