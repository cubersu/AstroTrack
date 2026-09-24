/**
 * DSO Astro Score (0–100): transparent, object-type-aware, explainable.
 * See docs/scoring.md for the full description of every component.
 */
import { airmass } from './airmass';
import type { AstroComponent, ConfidenceLevel, ScoreClass, ScoringSettings } from './config';
import {
  ACCESSIBILITY_MAG_TABLE,
  ACCESSIBILITY_SB_TABLE,
  ASTRO_WEIGHTS,
  CONFIDENCE_PENALTIES,
  DARK_NEBULA_ACCESSIBILITY,
  DURATION_TABLE,
  HARD_CONSTRAINT_CAP,
  MOON_TOLERANCE_FACTOR,
  TRACKING_RATIO_TABLE,
  UNKNOWN_ACCESSIBILITY,
  UNKNOWN_SIZE_FRAMING,
  INSUFFICIENT_DATA_CAP,
  altitudeQualityTable,
  classifyScore,
  confidenceLevel,
} from './config';
import { angularSeparationDeg, equatorialToHorizontal } from './coordinates';
import type { CameraSpec, FilterSpec, MountSpec, OpticsSpec } from './equipment';
import { cameraPixelPitchUm, isZoom, opticsMultiplier, workingAperture } from './equipment';
import type { Reason } from './explain';
import { sortReasons } from './explain';
import type { FramingResult } from './framing';
import { bestFocalLength } from './framing';
import type { IntegrationResult } from './integration';
import { integrationGuidance, physicalTimeFactor } from './integration';
import type { FilterKind, SiteSky, Transmission } from './lightPollution';
import {
  FILTER_TRANSMISSION,
  PRISTINE_SKY_SQM,
  REFERENCE_SKY_SQM,
  backgroundDegradation,
  customFilterTransmission,
  degradationScore,
} from './lightPollution';
import { MOON_MODEL_MIN_SEPARATION_DEG, moonSkyBrightnessNl } from './moonImpact';
import type { NightGrid } from './nightGrid';
import { sampleIndexAt } from './nightGrid';
import {
  altAzFieldRotationLimitS,
  effectiveTrailingDec,
  npfSeconds,
  TRAILING_MULTIPLIERS,
} from './npf';
import type { DsoType, SpectralClass } from './objectTypes';
import { TYPE_PROFILES } from './objectTypes';
import type { SbResult } from './surfaceBrightness';
import { resolveMagV, resolveSurfaceBrightness } from './surfaceBrightness';
import {
  magArcsec2ToNanoLambert,
  nanoLambertToMagArcsec2,
  relativeFlux,
  skyBrightnessAtZenithDistance,
} from './skyBrightness';
import type { SubExposureRecommendation } from './exposure';
import { recommendSubExposure } from './exposure';
import type { TrackingLimitSource } from './tracking';
import { trackingLimit } from './tracking';
import type { TimeWindow, VisibilitySummary } from './visibility';
import { summarizeVisibility, culminationAltitudeDeg } from './visibility';
import { MS_PER_HOUR, MS_PER_MINUTE, interpolateTable } from './units';

export interface TargetInput {
  id: string;
  type: DsoType;
  raDeg: number;
  decDeg: number;
  majorArcmin: number | null;
  minorArcmin: number | null;
  positionAngleDeg: number | null;
  magV: number | null;
  magB: number | null;
  sbCatalogue: number | null;
  sbBand: 'B' | 'V' | null;
}

export interface RigOptics {
  id: string;
  spec: OpticsSpec;
}
export interface RigFilter {
  id: string;
  spec: FilterSpec;
}
export interface RigInput {
  camera: CameraSpec;
  optics: RigOptics[];
  mount: MountSpec;
  /** Available filters; imaging without a filter is always considered too. */
  filters: RigFilter[];
}

export type ExposureMode = 'tracking' | 'fixed';
export type TimeMode = 'tonight' | 'now';

export interface EvaluationContext {
  grid: NightGrid;
  sky: SiteSky;
  settings: ScoringSettings;
  exposureMode: ExposureMode;
  timeMode: TimeMode;
  /** Evaluation start for 'now' mode (epoch ms). */
  nowMs?: number;
  /** User-available imaging time (hours); null = entire remaining night. */
  availableHours: number | null;
}

export type HardConstraint =
  | 'not-scored'
  | 'no-darkness'
  | 'never-rises'
  | 'below-min-altitude'
  | 'too-small'
  | 'too-large'
  | 'no-optics';

export interface ComponentScore {
  score: number;
  weight: number;
}

export interface OpticsChoice {
  opticsId: string;
  focalLengthMm: number;
  fNumber: number | null;
  apertureBasis: 'wide-open' | 'auto-stopped' | 'user' | 'unknown';
  warnAberrations: boolean;
  framing: FramingResult;
}

export interface MoonSummary {
  /** Mean sky brightening at the target over the window (mag). */
  meanDeltaMag: number;
  minSeparationDeg: number;
  meanSeparationDeg: number;
  illumination: number;
  /** Fraction of window samples with the Moon above the horizon. */
  upFraction: number;
}

export interface DsoEvaluation {
  targetId: string;
  /** Size and photometry both missing: score capped (see INSUFFICIENT_DATA_CAP). */
  insufficientData: boolean;
  score: number;
  rawScore: number;
  scoreClass: ScoreClass;
  components: Record<AstroComponent, ComponentScore>;
  hardConstraints: HardConstraint[];
  confidence: { points: number; level: ConfidenceLevel; factors: string[] };
  visibility: VisibilitySummary | null;
  /** Hours above min altitude in darkness (from now in 'now' mode). */
  usableHours: number;
  window: TimeWindow | null;
  windowMeanAltDeg: number | null;
  windowMeanAirmass: number | null;
  moon: MoonSummary | null;
  optics: OpticsChoice | null;
  filterId: string | null;
  filterKind: FilterKind;
  transmission: Transmission;
  sb: SbResult;
  integration: IntegrationResult | null;
  sub: SubExposureRecommendation | null;
  maxSubS: number | null;
  maxSubSource: TrackingLimitSource | 'npf' | 'field-rotation' | null;
  reasons: Reason[];
}

/* ---------------------------- helper models ---------------------------- */

/** Spectral signal transmission of the camera for a spectral class. */
export function cameraSignalFactor(camera: CameraSpec, spectral: SpectralClass): number {
  const stock =
    (camera.kind === 'dslr' || camera.kind === 'mirrorless') && camera.modification === 'stock';
  if (!stock) return 1;
  if (spectral === 'emission') return 0.45;
  if (spectral === 'mixed') return 0.75;
  return 1;
}

export function filterTransmission(
  filter: FilterSpec | null,
  spectral: SpectralClass,
): Transmission & { known: boolean } {
  if (!filter || filter.kind === 'none')
    return { ...FILTER_TRANSMISSION.none[spectral], known: true };
  if (filter.kind === 'custom') return customFilterTransmission(filter.bands, spectral);
  return { ...FILTER_TRANSMISSION[filter.kind][spectral], known: true };
}

export function cameraFilterCompatibility(
  camera: CameraSpec,
  spectral: SpectralClass,
  filterKind: FilterKind,
): number {
  const stock =
    (camera.kind === 'dslr' || camera.kind === 'mirrorless') && camera.modification === 'stock';
  if (spectral === 'emission') {
    if (!stock) return 100;
    return filterKind === 'dual-band' || filterKind === 'narrowband' || filterKind === 'cls-uhc'
      ? 70
      : 55;
  }
  if (spectral === 'mixed') return stock ? 80 : 100;
  return 100;
}

function emptyComponents(): Record<AstroComponent, ComponentScore> {
  const out = {} as Record<AstroComponent, ComponentScore>;
  for (const k of Object.keys(ASTRO_WEIGHTS) as AstroComponent[]) {
    out[k] = { score: 0, weight: ASTRO_WEIGHTS[k] };
  }
  return out;
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/* ------------------------------ main entry ------------------------------ */

export function evaluateDso(
  target: TargetInput,
  rig: RigInput,
  ctx: EvaluationContext,
): DsoEvaluation {
  const s = ctx.settings;
  const grid = ctx.grid;
  const prof = TYPE_PROFILES[target.type];
  const reasons: Reason[] = [];
  const hard: HardConstraint[] = [];
  const confFactors: string[] = [];
  let conf = 100;
  const penal = (key: keyof typeof CONFIDENCE_PENALTIES) => {
    conf -= CONFIDENCE_PENALTIES[key];
    confFactors.push(key);
  };

  const sb = resolveSurfaceBrightness({
    type: target.type,
    magV: target.magV,
    magB: target.magB,
    majorArcmin: target.majorArcmin,
    minorArcmin: target.minorArcmin,
    sbCatalogue: target.sbCatalogue,
    sbBand: target.sbBand,
  });
  const components = emptyComponents();
  const base: DsoEvaluation = {
    targetId: target.id,
    insufficientData: false,
    score: 0,
    rawScore: 0,
    scoreClass: 'unsuitable',
    components,
    hardConstraints: hard,
    confidence: { points: 100, level: 'high', factors: confFactors },
    visibility: null,
    usableHours: 0,
    window: null,
    windowMeanAltDeg: null,
    windowMeanAirmass: null,
    moon: null,
    optics: null,
    filterId: null,
    filterKind: 'none',
    transmission: { signal: 1, sky: 1 },
    sb,
    integration: null,
    sub: null,
    maxSubS: null,
    maxSubSource: null,
    reasons,
  };

  if (!prof.scored) {
    hard.push('not-scored');
    reasons.push({ code: 'hard.notScored', polarity: 'negative', component: 'hard', weight: 100 });
    return finalize(base, conf, 0, s);
  }
  if (culminationAltitudeDeg(target.decDeg, grid.location.latDeg) < 0) {
    hard.push('never-rises');
    reasons.push({ code: 'hard.neverRises', polarity: 'negative', component: 'hard', weight: 100 });
    return finalize(base, conf, 0, s);
  }
  if (grid.night.darkness === 'none' || grid.night.darkness === 'civil') {
    hard.push('no-darkness');
    reasons.push({ code: 'hard.noDarkness', polarity: 'negative', component: 'hard', weight: 100 });
    return finalize(base, conf, 0, s);
  }

  /* ---------- visibility & usable samples ---------- */
  const vis = summarizeVisibility(
    grid,
    { raDeg: target.raDeg, decDeg: target.decDeg },
    s.minAltitudeDeg,
  );
  base.visibility = vis;
  const n = grid.times.length;
  const stepH = grid.stepMinutes / 60;
  const startIdx =
    ctx.timeMode === 'now' && ctx.nowMs !== undefined ? sampleIndexAt(grid, ctx.nowMs) : 0;
  if (ctx.timeMode === 'now' && ctx.nowMs !== undefined && ctx.nowMs > grid.times[n - 1]) {
    hard.push('below-min-altitude');
    reasons.push({ code: 'hard.nowPassed', polarity: 'negative', component: 'hard', weight: 100 });
    return finalize(base, conf, 0, s);
  }
  const usable = new Uint8Array(n);
  let usableCount = 0;
  for (let i = startIdx; i < n; i++) {
    if (grid.dark[i] === 1 && vis.curve.alt[i] >= s.minAltitudeDeg) {
      usable[i] = 1;
      usableCount++;
    }
  }
  const usableHours = usableCount * stepH;
  base.usableHours = usableHours;
  if (usableCount === 0) {
    hard.push('below-min-altitude');
    reasons.push({
      code: 'hard.belowMinAltitude',
      polarity: 'negative',
      component: 'hard',
      weight: 100,
      params: { minAlt: s.minAltitudeDeg, maxAlt: Math.round(vis.maxDarkAltDeg) },
    });
    return finalize(base, conf, 0, s);
  }

  /* ---------- sky background, filters, camera ---------- */
  const spectral = prof.spectral;
  const siteNlZenith = magArcsec2ToNanoLambert(ctx.sky.sqm);
  const sRel = relativeFlux(sb.sbV, PRISTINE_SKY_SQM);
  const bSiteRel = relativeFlux(ctx.sky.sqm, PRISTINE_SKY_SQM);
  const camSignal = cameraSignalFactor(rig.camera, spectral);
  if (sb.basis === 'assumed') penal('sbAssumed');
  else if (sb.basis === 'derived') penal('sbDerived');
  if (ctx.sky.source === 'assumed') {
    penal('skyAssumed');
    reasons.push({
      code: 'lp.assumed',
      polarity: 'info',
      component: 'lightPollution',
      weight: 30,
      params: { bortle: ctx.sky.bortle },
    });
  } else if (ctx.sky.source === 'atlas-estimate') penal('skyAtlasEstimate');

  /* ---------- per-sample altitude and moon ---------- */
  const altTable = altitudeQualityTable(s);
  const qAlt = new Float32Array(n);
  const moonRel = new Float32Array(n);
  const moonSep = new Float32Array(n);
  const moonUp = new Uint8Array(n);
  const moonDelta = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!usable[i]) continue;
    const alt = vis.curve.alt[i];
    qAlt[i] = interpolateTable(altTable, alt);
    const sep = angularSeparationDeg(
      vis.posOfDate.raDeg,
      vis.posOfDate.decDeg,
      grid.moonRa[i],
      grid.moonDec[i],
    );
    moonSep[i] = sep;
    const mAlt = grid.moonAlt[i];
    moonUp[i] = mAlt > 0 ? 1 : 0;
    const mNl = moonSkyBrightnessNl(grid.moonPhaseAngle[i], sep, mAlt, alt, s.extinctionK);
    const bgNl = skyBrightnessAtZenithDistance(siteNlZenith, 90 - alt, s.extinctionK);
    // Express moonlight relative to the moonless background at this altitude,
    // then scale to zenith-equivalent relative flux for the integration model.
    moonRel[i] = (mNl / bgNl) * bSiteRel;
    moonDelta[i] = 2.5 * Math.log10((bgNl + mNl) / bgNl);
  }

  /* ---------- filter choice (minimise physical time factor) ---------- */
  let meanMoonAll = 0;
  for (let i = 0; i < n; i++) if (usable[i]) meanMoonAll += moonRel[i];
  meanMoonAll /= usableCount;
  const bRefRel = relativeFlux(REFERENCE_SKY_SQM, PRISTINE_SKY_SQM);
  const filterOptions: Array<{ id: string | null; spec: FilterSpec | null }> = [
    { id: null, spec: null },
    ...rig.filters.map((f) => ({ id: f.id, spec: f.spec })),
  ];
  let bestFilter = filterOptions[0];
  let bestTr: Transmission & { known: boolean } = { ...filterTransmission(null, spectral) };
  let bestFactor = Number.POSITIVE_INFINITY;
  for (const opt of filterOptions) {
    const ft = filterTransmission(opt.spec, spectral);
    const tr = { signal: ft.signal * camSignal, sky: ft.sky };
    const factor = physicalTimeFactor(sRel, bSiteRel + meanMoonAll, bRefRel, tr);
    if (factor < bestFactor * 0.97) {
      bestFactor = factor;
      bestFilter = opt;
      bestTr = { ...ft };
    }
  }
  const filterKind: FilterKind = bestFilter.spec?.kind ?? 'none';
  if (bestFilter.spec?.kind === 'custom' && !bestTr.known) {
    penal('customFilterUnknown');
    reasons.push({
      code: 'filter.unknownCustom',
      polarity: 'info',
      component: 'cameraFilter',
      weight: 10,
    });
  }
  const tr: Transmission = { signal: bestTr.signal * camSignal, sky: bestTr.sky };
  base.filterId = bestFilter.id;
  base.filterKind = filterKind;
  base.transmission = tr;

  /* ---------- per-sample moon degradation score ---------- */
  const moonExp = prof.moonExponent * MOON_TOLERANCE_FACTOR[s.moonTolerance];
  const qMoon = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!usable[i]) continue;
    const f = backgroundDegradation(bSiteRel + moonRel[i], bSiteRel, sRel, tr);
    qMoon[i] = degradationScore(f, moonExp);
  }

  /* ---------- pass 1 integration (all usable samples) ---------- */
  const monoCam = rig.camera.color === 'mono';
  const provisionalN = 4;
  const pass1 = integrationGuidance({
    type: target.type,
    sbV: sb.sbV,
    siteSqm: ctx.sky.sqm,
    moonRelFlux: meanMoonAll,
    meanAirmass: 1.3,
    extinctionK: s.extinctionK,
    fNumber: provisionalN,
    transmission: tr,
    mono: monoCam,
  });

  /* ---------- best window ---------- */
  const availableH = ctx.availableHours ?? usableHours;
  const windowH = Math.max(
    stepH,
    Math.min(availableH, Math.max(pass1.recommendedH, 1), (n - startIdx) * stepH),
  );
  const wLen = Math.max(1, Math.round(windowH / stepH));
  let bestStart = startIdx;
  let bestSum = -1;
  const lastStart = ctx.timeMode === 'now' ? startIdx : Math.max(startIdx, n - wLen);
  for (let st = startIdx; st <= lastStart; st++) {
    let sum = 0;
    for (let i = st; i < Math.min(n, st + wLen); i++) {
      if (usable[i]) sum += qAlt[i] * (0.5 + 0.5 * (qMoon[i] / 100));
    }
    if (sum > bestSum + 1e-6) {
      bestSum = sum;
      bestStart = st;
    }
  }
  const wEnd = Math.min(n, bestStart + wLen);
  let altSum = 0;
  let altMeanDeg = 0;
  let amSum = 0;
  let moonSum = 0;
  let moonRelSum = 0;
  let wUsable = 0;
  let sepMin = 180;
  let sepSum = 0;
  let upCount = 0;
  let deltaSum = 0;
  let abovePref = 0;
  let firstUsable = -1;
  let lastUsable = -1;
  for (let i = bestStart; i < wEnd; i++) {
    altSum += qAlt[i]; // 0 when unusable
    if (!usable[i]) continue;
    if (firstUsable < 0) firstUsable = i;
    lastUsable = i;
    wUsable++;
    altMeanDeg += vis.curve.alt[i];
    amSum += airmass(vis.curve.alt[i]);
    moonSum += qMoon[i];
    moonRelSum += moonRel[i];
    sepMin = Math.min(sepMin, moonSep[i]);
    sepSum += moonSep[i];
    upCount += moonUp[i];
    deltaSum += moonDelta[i];
    if (vis.curve.alt[i] >= s.preferredAltitudeDeg) abovePref++;
  }
  const wCount = wEnd - bestStart;
  const altitudeScore = altSum / wCount;
  const meanAlt = altMeanDeg / Math.max(wUsable, 1);
  const meanAm = amSum / Math.max(wUsable, 1);
  const moonScore = moonSum / Math.max(wUsable, 1);
  const meanMoonRel = moonRelSum / Math.max(wUsable, 1);
  const stepMs = grid.stepMinutes * MS_PER_MINUTE;
  base.window =
    firstUsable >= 0
      ? {
          startMs: grid.times[firstUsable],
          endMs: Math.min(grid.times[lastUsable] + stepMs, grid.times[n - 1]),
        }
      : null;
  base.windowMeanAltDeg = meanAlt;
  base.windowMeanAirmass = meanAm;
  const moonIllum =
    grid.moonIllumination[Math.floor((bestStart + wEnd) / 2)] ?? grid.moonAtMidnight.illumination;
  base.moon = {
    meanDeltaMag: deltaSum / Math.max(wUsable, 1),
    minSeparationDeg: sepMin,
    meanSeparationDeg: sepSum / Math.max(wUsable, 1),
    illumination: moonIllum,
    upFraction: upCount / Math.max(wUsable, 1),
  };

  // Altitude component
  components.altitude.score = altitudeScore;
  const prefPct = Math.round((100 * abovePref) / Math.max(wUsable, 1));
  if (altitudeScore >= 75) {
    reasons.push({
      code: 'altitude.high',
      polarity: 'positive',
      component: 'altitude',
      weight: 60,
      params: { alt: s.preferredAltitudeDeg, pct: prefPct, meanAlt: Math.round(meanAlt) },
    });
  } else if (altitudeScore >= 50) {
    reasons.push({
      code: 'altitude.medium',
      polarity: 'info',
      component: 'altitude',
      weight: 30,
      params: { meanAlt: Math.round(meanAlt) },
    });
  } else {
    reasons.push({
      code: 'altitude.low',
      polarity: 'negative',
      component: 'altitude',
      weight: 60,
      params: { meanAlt: Math.round(meanAlt), maxAlt: Math.round(vis.maxDarkAltDeg) },
    });
  }
  reasons.push({
    code: 'altitude.airmass',
    polarity: 'info',
    component: 'altitude',
    weight: 5,
    params: { airmass: round1(meanAm) },
  });

  // Duration component
  components.duration.score = interpolateTable(DURATION_TABLE, usableHours);
  if (usableHours >= 4)
    reasons.push({
      code: 'duration.long',
      polarity: 'positive',
      component: 'duration',
      weight: 35,
      params: { hours: round1(usableHours) },
    });
  else if (usableHours >= 2)
    reasons.push({
      code: 'duration.ok',
      polarity: 'info',
      component: 'duration',
      weight: 15,
      params: { hours: round1(usableHours) },
    });
  else
    reasons.push({
      code: 'duration.short',
      polarity: 'negative',
      component: 'duration',
      weight: 45,
      params: { hours: round1(usableHours) },
    });

  // Moon component
  components.moon.score = moonScore;
  const illumPct = Math.round(moonIllum * 100);
  if (upCount === 0) {
    reasons.push({
      code: 'moon.down',
      polarity: 'positive',
      component: 'moon',
      weight: 40,
      params: { illum: illumPct },
    });
  } else if (moonScore >= 75) {
    reasons.push({
      code: 'moon.farDim',
      polarity: 'positive',
      component: 'moon',
      weight: 35,
      params: { illum: illumPct, sep: Math.round(base.moon.meanSeparationDeg) },
    });
  } else if (moonScore >= 45) {
    reasons.push({
      code: 'moon.moderate',
      polarity: 'info',
      component: 'moon',
      weight: 30,
      params: {
        illum: illumPct,
        sep: Math.round(base.moon.meanSeparationDeg),
        delta: round1(base.moon.meanDeltaMag),
      },
    });
  } else {
    reasons.push({
      code: 'moon.bright',
      polarity: 'negative',
      component: 'moon',
      weight: 70,
      params: {
        illum: illumPct,
        sep: Math.round(base.moon.meanSeparationDeg),
        delta: round1(base.moon.meanDeltaMag),
      },
    });
  }
  if (upCount > 0 && sepMin < 20) {
    reasons.push({
      code: 'moon.close',
      polarity: 'negative',
      component: 'moon',
      weight: 50,
      params: { sep: Math.round(sepMin) },
    });
    if (sepMin < MOON_MODEL_MIN_SEPARATION_DEG) penal('moonVeryClose');
  }

  // Light pollution component
  const gLp = backgroundDegradation(bSiteRel, 1, sRel, tr);
  components.lightPollution.score = degradationScore(gLp, prof.lpExponent);
  const bortle = ctx.sky.bortle;
  const lpParams = { bortle, sqm: round1(ctx.sky.sqm), source: ctx.sky.source };
  if (components.lightPollution.score >= 75)
    reasons.push({
      code: 'lp.dark',
      polarity: 'positive',
      component: 'lightPollution',
      weight: 40,
      params: lpParams,
    });
  else if (components.lightPollution.score >= 45)
    reasons.push({
      code: 'lp.moderate',
      polarity: 'info',
      component: 'lightPollution',
      weight: 30,
      params: lpParams,
    });
  else
    reasons.push({
      code: 'lp.bright',
      polarity: 'negative',
      component: 'lightPollution',
      weight: 65,
      params: lpParams,
    });
  if (filterKind !== 'none' && filterKind !== 'uv-ir-cut') {
    reasons.push({
      code: 'lp.filterHelps',
      polarity: 'positive',
      component: 'lightPollution',
      weight: 25,
      params: { filter: filterKind },
    });
  }

  // Camera / filter compatibility
  components.cameraFilter.score = cameraFilterCompatibility(rig.camera, spectral, filterKind);
  if (spectral === 'emission' && components.cameraFilter.score < 100) {
    reasons.push({
      code: filterKind === 'none' ? 'camera.stockEmission' : 'camera.stockEmissionFiltered',
      polarity: 'negative',
      component: 'cameraFilter',
      weight: 40,
    });
  } else if (spectral === 'emission') {
    reasons.push({
      code: 'camera.goodMatch',
      polarity: 'positive',
      component: 'cameraFilter',
      weight: 20,
    });
  }

  // Accessibility
  const { magV } = resolveMagV(target);
  let access: number;
  if (target.type === 'dark-nebula') {
    access = DARK_NEBULA_ACCESSIBILITY;
    reasons.push({
      code: 'access.darkNebula',
      polarity: 'info',
      component: 'accessibility',
      weight: 20,
    });
  } else if (spectral === 'stellar' && magV != null) {
    access = interpolateTable(ACCESSIBILITY_MAG_TABLE, magV);
  } else if (sb.basis !== 'assumed') {
    access = interpolateTable(ACCESSIBILITY_SB_TABLE, sb.sbV);
  } else {
    access = UNKNOWN_ACCESSIBILITY;
    reasons.push({
      code: 'access.unknown',
      polarity: 'info',
      component: 'accessibility',
      weight: 15,
    });
  }
  if (magV == null && target.type !== 'dark-nebula') penal('magnitudeMissing');
  components.accessibility.score = access;
  if (target.type !== 'dark-nebula' && sb.basis !== 'assumed') {
    const p = { sb: round1(sb.sbV), mag: magV != null ? round1(magV) : '—' };
    if (access >= 80)
      reasons.push({
        code: 'access.bright',
        polarity: 'positive',
        component: 'accessibility',
        weight: 30,
        params: p,
      });
    else if (access >= 50)
      reasons.push({
        code: 'access.moderate',
        polarity: 'info',
        component: 'accessibility',
        weight: 15,
        params: p,
      });
    else
      reasons.push({
        code: 'access.faint',
        polarity: 'negative',
        component: 'accessibility',
        weight: 40,
        params: p,
      });
  }

  /* ---------- optics / framing / exposure ---------- */
  if (target.majorArcmin == null || !(target.majorArcmin > 0)) penal('sizeMissing');
  const pitch = cameraPixelPitchUm(rig.camera);
  const sensor = {
    widthMm: rig.camera.sensorWidthMm,
    heightMm: rig.camera.sensorHeightMm,
    pixelPitchUm: pitch,
  };
  const shape = {
    majorArcmin: target.majorArcmin && target.majorArcmin > 0 ? target.majorArcmin : 0,
    minorArcmin: target.minorArcmin,
    positionAngleDeg: target.positionAngleDeg,
  };
  const midIdx = firstUsable >= 0 ? Math.floor((firstUsable + lastUsable) / 2) : bestStart;
  const midHor = equatorialToHorizontal(
    vis.posOfDate.raDeg,
    vis.posOfDate.decDeg,
    grid.location.latDeg,
    grid.lst[midIdx],
  );
  const fixed = ctx.exposureMode === 'fixed' || !rig.mount.tracking;

  interface Cand {
    choice: OpticsChoice;
    maxSub: number;
    maxSubSource: DsoEvaluation['maxSubSource'];
    trackScore: number;
    sub: SubExposureRecommendation;
    selection: number;
  }
  let best: Cand | null = null;
  const skyEffSqm = nanoLambertToMagArcsec2(
    magArcsec2ToNanoLambert(ctx.sky.sqm) * (1 + meanMoonRel / bSiteRel),
  );
  for (const o of rig.optics) {
    const m = opticsMultiplier(o.spec);
    const fMin = o.spec.focalLengthMm * m;
    const fMax = (isZoom(o.spec) ? o.spec.focalLengthMaxMm! : o.spec.focalLengthMm) * m;
    let framing: FramingResult;
    if (shape.majorArcmin > 0) {
      framing = bestFocalLength(shape, sensor, fMin, fMax, s.framingStyle, {
        minFill: s.minFrameFill,
        minTargetPx: s.minTargetPx,
      });
    } else {
      // Unknown size: neutral framing, choose the middle of the range.
      framing = bestFocalLength({ majorArcmin: 1 }, sensor, fMin, fMax, s.framingStyle);
      framing = {
        ...framing,
        fill: Number.NaN,
        targetPx: Number.NaN,
        score: UNKNOWN_SIZE_FRAMING,
        tooSmall: false,
        tooLarge: false,
        fits: true,
        mosaicSuggested: false,
        rotationDeg: null,
        orientation: 'any',
      };
    }
    const nativeFocal = framing.focalLengthMm / m;
    const ap = workingAperture(o.spec, nativeFocal);
    const fNum = ap?.fNumber ?? null;
    let maxSub: number;
    let maxSubSource: DsoEvaluation['maxSubSource'];
    if (fixed) {
      const effDec = effectiveTrailingDec(target.decDeg, framing.fovHeightDeg);
      maxSub =
        npfSeconds(fNum ?? 4, framing.focalLengthMm, pitch, effDec) *
        TRAILING_MULTIPLIERS[s.trailingTolerance];
      maxSubSource = 'npf';
    } else {
      const tl = trackingLimit(rig.mount, framing.focalLengthMm);
      maxSub = tl.seconds;
      maxSubSource = tl.source;
      if (!rig.mount.equatorial) {
        const halfDiagPx = Math.hypot(rig.camera.resolutionX, rig.camera.resolutionY) / 2;
        const fr = altAzFieldRotationLimitS(
          grid.location.latDeg,
          midHor.azDeg,
          midHor.altDeg,
          halfDiagPx,
        );
        if (fr < maxSub) {
          maxSub = fr;
          maxSubSource = 'field-rotation';
        }
      }
    }
    const ideal = recommendSubExposure({
      camera: rig.camera,
      focalMm: framing.focalLengthMm,
      fNumber: fNum ?? 4,
      sqmEffective: skyEffSqm,
      skyTransmission: tr.sky,
      maxFromMountS: Number.POSITIVE_INFINITY,
      mountLimitReason: fixed ? 'trailing' : 'tracking',
    });
    const desired = ideal.recommendedS;
    const ratio = desired > 0 ? maxSub / desired : 1;
    const trackScore = interpolateTable(TRACKING_RATIO_TABLE, ratio);
    const sub = recommendSubExposure({
      camera: rig.camera,
      focalMm: framing.focalLengthMm,
      fNumber: fNum ?? 4,
      sqmEffective: skyEffSqm,
      skyTransmission: tr.sky,
      maxFromMountS: maxSub,
      mountLimitReason: fixed ? 'trailing' : 'tracking',
      brightCore:
        target.type === 'planetary-nebula' || (sb.sbV < 19 && target.type !== 'open-cluster'),
    });
    const speed = fNum ? Math.min(1, (4 / fNum) ** 2) : 0.5;
    const selection = framing.score * 0.75 + trackScore * 0.15 + speed * 100 * 0.1;
    const choice: OpticsChoice = {
      opticsId: o.id,
      focalLengthMm: framing.focalLengthMm,
      fNumber: fNum,
      apertureBasis: ap?.basis ?? 'unknown',
      warnAberrations: ap?.warnAberrations ?? false,
      framing,
    };
    if (!best || selection > best.selection)
      best = { choice, maxSub, maxSubSource, trackScore, sub, selection };
  }

  if (!best) {
    hard.push('no-optics');
    reasons.push({ code: 'hard.noOptics', polarity: 'negative', component: 'hard', weight: 100 });
  } else {
    base.optics = best.choice;
    base.maxSubS = best.maxSub;
    base.maxSubSource = best.maxSubSource;
    base.sub = best.sub;
    if (best.choice.fNumber === null) penal('apertureUnknown');
    const fr = best.choice.framing;
    components.framing.score = fr.score;
    const fl = Math.round(fr.focalLengthMm);
    if (shape.majorArcmin <= 0) {
      reasons.push({
        code: 'framing.sizeUnknown',
        polarity: 'info',
        component: 'framing',
        weight: 25,
      });
    } else if (fr.mosaicSuggested) {
      reasons.push({
        code: 'framing.mosaic',
        polarity: 'negative',
        component: 'framing',
        weight: 55,
        params: { focal: fl },
      });
    } else if (fr.score >= 90) {
      reasons.push({
        code: 'framing.excellent',
        polarity: 'positive',
        component: 'framing',
        weight: 55,
        params: { focal: fl },
      });
    } else if (fr.score >= 65) {
      reasons.push({
        code: 'framing.good',
        polarity: 'positive',
        component: 'framing',
        weight: 35,
        params: { focal: fl },
      });
    } else {
      reasons.push({
        code: 'framing.small',
        polarity: 'negative',
        component: 'framing',
        weight: 55,
        params: { focal: fl, fill: Math.round(fr.fill * 1000) / 10 },
      });
    }
    // Hard: all optics too small / too large → since we picked the best, check the chosen one.
    if (shape.majorArcmin > 0 && fr.tooSmall) {
      hard.push('too-small');
      reasons.push({
        code: 'hard.tooSmall',
        polarity: 'negative',
        component: 'hard',
        weight: 95,
        params: { px: Math.round(fr.targetPx), focal: fl },
      });
    }
    if (shape.majorArcmin > 0 && fr.tooLarge) {
      hard.push('too-large');
      reasons.push({
        code: 'hard.tooLarge',
        polarity: 'negative',
        component: 'hard',
        weight: 95,
        params: { focal: fl },
      });
    }
    components.trackingExposure.score = best.trackScore;
    const sec = Math.round(best.maxSub * 10) / 10;
    if (fixed) {
      reasons.push({
        code: best.trackScore >= 60 ? 'tracking.fixedOk' : 'tracking.fixedShort',
        polarity: best.trackScore >= 60 ? 'info' : 'negative',
        component: 'trackingExposure',
        weight: best.trackScore >= 60 ? 10 : 35,
        params: { sec },
      });
    } else {
      if (best.trackScore < 60)
        reasons.push({
          code: 'tracking.limited',
          polarity: 'negative',
          component: 'trackingExposure',
          weight: 30,
          params: { sec },
        });
      else
        reasons.push({
          code: 'tracking.ok',
          polarity: 'info',
          component: 'trackingExposure',
          weight: 5,
          params: { sec },
        });
      if (best.maxSubSource === 'default-unguided') {
        penal('trackingUncalibrated');
        reasons.push({
          code: 'tracking.uncalibrated',
          polarity: 'info',
          component: 'trackingExposure',
          weight: 12,
          params: { sec },
        });
      } else if (best.maxSubSource === 'extrapolated-far') {
        penal('trackingExtrapolatedFar');
      }
    }
  }
  if (filterKind !== 'none') {
    reasons.push({
      code: 'filter.chosen',
      polarity: 'info',
      component: 'cameraFilter',
      weight: 8,
      params: { filter: filterKind },
    });
  }

  /* ---------- integration (pass 2, window conditions) ---------- */
  base.integration = integrationGuidance({
    type: target.type,
    sbV: sb.sbV,
    siteSqm: ctx.sky.sqm,
    moonRelFlux: meanMoonRel,
    meanAirmass: meanAm,
    extinctionK: s.extinctionK,
    fNumber: best?.choice.fNumber ?? provisionalN,
    transmission: tr,
    mono: monoCam,
  });

  if (shape.majorArcmin <= 0 && sb.basis === 'assumed' && target.type !== 'dark-nebula') {
    base.insufficientData = true;
    reasons.push({
      code: 'data.insufficient',
      polarity: 'negative',
      component: 'hard',
      weight: 90,
    });
  }

  /* ---------- total ---------- */
  let total = 0;
  for (const k of Object.keys(components) as AstroComponent[]) {
    total += components[k].score * components[k].weight;
  }
  return finalize(base, conf, total, s);
}

function finalize(ev: DsoEvaluation, conf: number, raw: number, s: ScoringSettings): DsoEvaluation {
  let score = raw;
  const h = ev.hardConstraints;
  if (
    h.includes('not-scored') ||
    h.includes('never-rises') ||
    h.includes('below-min-altitude') ||
    h.includes('no-darkness')
  ) {
    score = 0;
  } else if (h.length > 0) {
    score = Math.min(score, HARD_CONSTRAINT_CAP);
  }
  if (ev.insufficientData) score = Math.min(score, INSUFFICIENT_DATA_CAP);
  ev.rawScore = Math.round(raw * 10) / 10;
  ev.score = Math.round(Math.max(0, Math.min(100, score)));
  ev.scoreClass = classifyScore(ev.score, s.classThresholds);
  const points = Math.max(0, conf);
  ev.confidence = { points, level: confidenceLevel(points), factors: ev.confidence.factors };
  ev.reasons = sortReasons(ev.reasons);
  return ev;
}

/** Hours between two instants. */
export function hoursBetween(a: number, b: number): number {
  return (b - a) / MS_PER_HOUR;
}
