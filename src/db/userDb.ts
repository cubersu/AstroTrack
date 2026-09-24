/** Local user database (IndexedDB via Dexie). Never synchronised anywhere. */
import Dexie, { type EntityTable } from 'dexie';
import type {
  ActiveSession,
  AppSettings,
  CameraProfile,
  ExposureCalibration,
  Favorite,
  FilterProfile,
  JournalEntry,
  JournalImage,
  MountProfile,
  ObservingLocation,
  OpticsProfile,
  Plan,
  RigProfile,
} from './types';

export class UserDb extends Dexie {
  cameras!: EntityTable<CameraProfile, 'id'>;
  optics!: EntityTable<OpticsProfile, 'id'>;
  mounts!: EntityTable<MountProfile, 'id'>;
  filters!: EntityTable<FilterProfile, 'id'>;
  rigs!: EntityTable<RigProfile, 'id'>;
  locations!: EntityTable<ObservingLocation, 'id'>;
  favorites!: EntityTable<Favorite, 'objectId'>;
  plans!: EntityTable<Plan, 'id'>;
  journal!: EntityTable<JournalEntry, 'id'>;
  journalImages!: EntityTable<JournalImage, 'id'>;
  exposureCalibrations!: EntityTable<ExposureCalibration, 'id'>;
  session!: EntityTable<ActiveSession, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor(name = 'astrotrack-user') {
    super(name);
    this.version(1).stores({
      cameras: 'id, name',
      optics: 'id, name',
      mounts: 'id, name',
      filters: 'id, name',
      rigs: 'id, name',
      locations: 'id, name',
      favorites: 'objectId, addedAt',
      plans: 'id, targetId, status, startDate',
      journal: 'id, date, targetId, planId',
      journalImages: 'id',
      exposureCalibrations: 'id, createdAt',
      session: 'id',
      settings: 'id',
    });
  }
}

let instance: UserDb | null = null;
export function userDb(): UserDb {
  if (!instance) instance = new UserDb();
  return instance;
}

export function setUserDbForTests(db: UserDb | null) {
  instance = db;
}

/** Tables included in backups (user-owned data). Order matters for restore. */
export const BACKUP_TABLES = [
  'settings',
  'cameras',
  'optics',
  'mounts',
  'filters',
  'rigs',
  'locations',
  'favorites',
  'plans',
  'journal',
  'journalImages',
  'exposureCalibrations',
  'session',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
