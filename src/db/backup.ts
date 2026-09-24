/**
 * Full local backup (portable JSON) and restore. Everything user-owned is
 * included; re-downloadable astronomical data is not (only pack metadata).
 */
import type { Table } from 'dexie';
import { BACKUP_TABLES, userDb } from './userDb';
import type { BackupTable } from './userDb';
import type { JournalEntry, JournalImage } from './types';

export const BACKUP_FORMAT = 'astrotrack-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: { name: string; version: string };
  dataPacks: Array<{ id: string; version: string; installedAt: number }>;
  tables: Partial<Record<BackupTable, unknown[]>>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk)
    s += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(s);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

export async function exportBackup(
  dataPacks: BackupFile['dataPacks'] = [],
  appVersion = '0.0.0',
): Promise<BackupFile> {
  const db = userDb();
  const tables: BackupFile['tables'] = {};
  for (const name of BACKUP_TABLES) {
    const rows = await (db[name] as unknown as Table<unknown, string>).toArray();
    if (name === 'journalImages') {
      tables[name] = await Promise.all(
        (rows as JournalImage[]).map(async (r) => ({
          id: r.id,
          mime: r.mime,
          size: r.size,
          createdAt: r.createdAt,
          dataBase64: await blobToBase64(r.blob),
        })),
      );
    } else tables[name] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: { name: 'AstroTrack', version: appVersion },
    dataPacks,
    tables,
  };
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

const KEY_FIELD: Partial<Record<BackupTable, string>> = { favorites: 'objectId' };

export function validateBackup(data: unknown): BackupFile {
  if (!data || typeof data !== 'object') throw new BackupError('not-an-object');
  const b = data as Partial<BackupFile>;
  if (b.format !== BACKUP_FORMAT) throw new BackupError('wrong-format');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
    throw new BackupError('unsupported-version');
  if (!b.tables || typeof b.tables !== 'object') throw new BackupError('missing-tables');
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name))
      throw new BackupError(`unknown-table:${name}`);
    if (!Array.isArray(rows)) throw new BackupError(`bad-table:${name}`);
    const key = KEY_FIELD[name as BackupTable] ?? 'id';
    for (const r of rows) {
      if (!r || typeof r !== 'object' || typeof (r as Record<string, unknown>)[key] !== 'string')
        throw new BackupError(`bad-record:${name}`);
    }
  }
  return b as BackupFile;
}

export interface ImportResult {
  counts: Partial<Record<BackupTable, number>>;
}

/**
 * Restore a backup. 'replace' clears the user tables first (inside the same
 * transaction, so a failure leaves the existing data untouched); 'merge'
 * upserts by ID.
 */
export async function importBackup(
  data: unknown,
  mode: 'replace' | 'merge',
): Promise<ImportResult> {
  const b = validateBackup(data);
  const db = userDb();
  const counts: ImportResult['counts'] = {};
  const tables = BACKUP_TABLES.map((n) => db[n] as unknown as Table<unknown, string>);
  await db.transaction('rw', tables, async () => {
    for (const name of BACKUP_TABLES) {
      const table = db[name] as unknown as Table<unknown, string>;
      if (mode === 'replace') await table.clear();
      let rows = (b.tables[name] ?? []) as unknown[];
      if (name === 'journalImages') {
        rows = (
          rows as Array<{
            id: string;
            mime: string;
            size: number;
            createdAt: number;
            dataBase64: string;
          }>
        ).map((r) => ({
          id: r.id,
          mime: r.mime,
          size: r.size,
          createdAt: r.createdAt,
          blob: base64ToBlob(r.dataBase64, r.mime),
        }));
      }
      if (rows.length) await table.bulkPut(rows);
      counts[name] = rows.length;
    }
  });
  return { counts };
}

const CSV_COLUMNS: Array<keyof JournalEntry> = [
  'date',
  'targetName',
  'locationName',
  'latDeg',
  'lonDeg',
  'cameraName',
  'opticsName',
  'focalLengthMm',
  'fNumber',
  'exposureMode',
  'filterName',
  'isoGain',
  'subExposureS',
  'lightCount',
  'totalIntegrationS',
  'darks',
  'flats',
  'bias',
  'darkFlats',
  'bortle',
  'sqm',
  'rating',
  'trailing',
  'notes',
];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function journalToCsv(entries: JournalEntry[]): string {
  const header = [
    ...CSV_COLUMNS,
    'weatherScore',
    'cloudPct',
    'temperatureC',
    'humidityPct',
    'windKmh',
  ];
  const lines = [header.join(',')];
  for (const e of entries) {
    const row = CSV_COLUMNS.map((c) => csvCell(e[c]));
    row.push(
      csvCell(e.weather?.score != null ? Math.round(e.weather.score) : null),
      csvCell(e.weather?.cloudPct),
      csvCell(e.weather?.temperatureC),
      csvCell(e.weather?.humidityPct),
      csvCell(e.weather?.windKmh),
    );
    lines.push(row.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
