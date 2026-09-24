/**
 * Persistent, user-owned entities (stored locally in IndexedDB, included in backups).
 * Equipment entities carry only physical properties plus a cosmetic name.
 */
import type { ScoringSettings } from '../astro/config';
import type {
  CameraKind,
  Modification,
  MountCalibrationPoint,
  OpticsKind,
  SensorAdvanced,
  SensorColor,
} from '../astro/equipment';
import type { FilterBand, FilterKind } from '../astro/lightPollution';
import type { ExposureMode } from '../astro/scoring';
import type { Clipping, HistogramBucket, StarShape } from '../astro/exposure';
import type { Language } from '../i18n/i18n';

export interface Timestamps {
  createdAt: number;
  updatedAt: number;
}

export interface CameraProfile extends Timestamps {
  id: string;
  name: string;
  sensorWidthMm: number;
  sensorHeightMm: number;
  resolutionX: number;
  resolutionY: number;
  pixelPitchUm: number | null;
  color: SensorColor;
  kind: CameraKind;
  modification: Modification;
  advanced: SensorAdvanced | null;
}

export interface OpticsProfile extends Timestamps {
  id: string;
  name: string;
  kind: OpticsKind;
  focalLengthMm: number;
  focalLengthMaxMm: number | null;
  apertureMm: number | null;
  fNumber: number | null;
  fNumberAtMax: number | null;
  preferredFNumber: number | 'auto' | null;
  multiplier: number | null;
}

export interface MountProfile extends Timestamps {
  id: string;
  name: string;
  tracking: boolean;
  equatorial: boolean;
  guiding: boolean;
  payloadKg: number | null;
  calibration: MountCalibrationPoint[];
}

export interface FilterProfile extends Timestamps {
  id: string;
  name: string;
  kind: FilterKind;
  bands: FilterBand[];
}

/** An equipment profile ("rig"): the gear taken to the field together. */
export interface RigProfile extends Timestamps {
  id: string;
  name: string;
  cameraId: string;
  opticsIds: string[];
  mountId: string | null;
  filterIds: string[];
}

export interface ObservingLocation extends Timestamps {
  id: string;
  name: string;
  latDeg: number;
  lonDeg: number;
  elevationM: number | null;
  /** IANA time zone for display; null = device time zone. */
  timeZone: string | null;
  bortleManual: number | null;
  sqmManual: number | null;
  /** Last atlas estimate shown to the user (cached; recomputed when packs change). */
  atlasSqm: number | null;
  notes: string;
}

export interface Favorite {
  objectId: string;
  addedAt: number;
  note: string;
}

export type PlanType = 'single' | 'multi';

export interface Plan extends Timestamps {
  id: string;
  name: string;
  type: PlanType;
  targetId: string;
  targetName: string;
  locationId: string | null;
  rigId: string | null;
  opticsId: string | null;
  focalLengthMm: number | null;
  fNumber: number | null;
  exposureMode: ExposureMode;
  filterId: string | null;
  subExposureS: number | null;
  isoGain: string;
  /** 'custom' uses goalHours; 'recommended' follows the engine's recommendation. */
  goalMode: 'custom' | 'recommended';
  goalHours: number | null;
  startDate: string;
  /** Planned nights (YYYY-MM-DD), for multi-night plans. */
  nights: string[];
  status: 'active' | 'done' | 'archived';
  notes: string;
}

export interface WeatherSnapshot {
  capturedAt: number;
  score: number | null;
  cloudPct: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windKmh: number | null;
}

export interface JournalEntry extends Timestamps {
  id: string;
  date: string;
  locationName: string;
  latDeg: number | null;
  lonDeg: number | null;
  targetId: string | null;
  targetName: string;
  cameraName: string;
  opticsName: string;
  focalLengthMm: number | null;
  fNumber: number | null;
  exposureMode: ExposureMode;
  filterName: string;
  isoGain: string;
  subExposureS: number | null;
  lightCount: number | null;
  totalIntegrationS: number | null;
  darks: number | null;
  flats: number | null;
  bias: number | null;
  darkFlats: number | null;
  bortle: number | null;
  sqm: number | null;
  weather: WeatherSnapshot | null;
  rating: number | null;
  notes: string;
  trailing: StarShape | null;
  imageId: string | null;
  planId: string | null;
  /** Explicit opt-in: use this session's focal length/exposure as a mount calibration point. */
  useForMountCalibration: boolean;
  mountId: string | null;
}

export interface JournalImage {
  id: string;
  blob: Blob;
  mime: string;
  size: number;
  createdAt: number;
}

export interface ExposureCalibration {
  id: string;
  createdAt: number;
  cameraId: string | null;
  opticsId: string | null;
  focalLengthMm: number;
  fNumber: number | null;
  isoGain: string;
  subExposureS: number;
  histogram: HistogramBucket;
  stars: StarShape;
  clipping: Clipping;
  suggestedS: number;
  bortle: number | null;
}

export interface ActiveSession {
  id: 'active';
  startedAt: number;
  targetId: string;
  targetName: string;
  planId: string | null;
  locationId: string | null;
  rigId: string | null;
  opticsId: string | null;
  focalLengthMm: number | null;
  fNumber: number | null;
  subExposureS: number;
  plannedLights: number;
  completedLights: number;
  isoGain: string;
  notes: string;
}

export type ThemeName = 'light' | 'dark' | 'night';
export type AvailabilityChoice = 'night' | '30' | '60' | '90' | 'custom';

export interface AppSettings {
  id: 'app';
  language: Language | null;
  theme: ThemeName;
  activeLocationId: string | null;
  activeRigId: string | null;
  exposureMode: ExposureMode;
  availability: AvailabilityChoice;
  customAvailabilityMin: number;
  /** null = not decided yet (ask), true/false = explicit user choice. */
  weatherEnabled: boolean | null;
  scoring: ScoringSettings;
  /** Optional alternative source for data-pack updates (must serve packs.json). */
  dataSourceUrl: string | null;
  previewsEnabled: boolean;
  nightVisionSuggest: boolean;
  onboardingDone: boolean;
}

export interface DownloadedPackMeta {
  id: string;
  version: string;
  installedAt: number;
}
