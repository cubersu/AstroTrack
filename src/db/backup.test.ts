import { beforeEach, describe, expect, it } from 'vitest';
import { exportBackup, importBackup, journalToCsv, validateBackup } from './backup';
import { UserDb, setUserDbForTests, userDb } from './userDb';
import { saveEntity, repos, deleteEquipment } from './repo';
import { getSettings, updateSettings } from './settings';
import type { JournalEntry } from './types';

function journal(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'j1',
    createdAt: 1,
    updatedAt: 1,
    date: '2026-10-10',
    locationName: 'Home, "backyard"',
    latDeg: 41,
    lonDeg: 29,
    targetId: 'ongc:NGC0224',
    targetName: 'M 31',
    cameraName: 'APS-C',
    opticsName: '18–200',
    focalLengthMm: 200,
    fNumber: 6.3,
    exposureMode: 'tracking',
    filterName: '',
    isoGain: 'ISO 800',
    subExposureS: 60,
    lightCount: 120,
    totalIntegrationS: 7200,
    darks: 20,
    flats: 30,
    bias: 50,
    darkFlats: null,
    bortle: 5,
    sqm: null,
    weather: {
      capturedAt: 1,
      score: 88.4,
      cloudPct: 5,
      temperatureC: 11,
      humidityPct: 70,
      windKmh: 6,
    },
    rating: 4,
    notes: 'line1\nline2',
    trailing: 'round',
    imageId: null,
    planId: null,
    useForMountCalibration: false,
    mountId: null,
    ...over,
  };
}

describe('persistence and backup', () => {
  beforeEach(() => setUserDbForTests(new UserDb(`user-${Math.random()}`)));

  it('persists equipment, locations and settings', async () => {
    const cam = await saveEntity(repos.cameras(), {
      name: 'Cam',
      sensorWidthMm: 22.3,
      sensorHeightMm: 14.9,
      resolutionX: 6000,
      resolutionY: 4000,
      pixelPitchUm: null,
      color: 'color',
      kind: 'dslr',
      modification: 'stock',
      advanced: null,
    });
    const loc = await saveEntity(repos.locations(), {
      name: 'Site',
      latDeg: 41,
      lonDeg: 29,
      elevationM: 100,
      timeZone: null,
      bortleManual: 6,
      sqmManual: null,
      atlasSqm: null,
      notes: '',
    });
    await updateSettings({ activeLocationId: loc.id, theme: 'night' });
    expect((await repos.cameras().get(cam.id))?.name).toBe('Cam');
    const s = await getSettings();
    expect(s.theme).toBe('night');
    expect(s.activeLocationId).toBe(loc.id);
    expect(s.scoring.minAltitudeDeg).toBe(25);
  });

  it('removes dangling references when equipment is deleted', async () => {
    const o = await saveEntity(repos.optics(), {
      name: 'L',
      kind: 'lens',
      focalLengthMm: 50,
      focalLengthMaxMm: null,
      apertureMm: null,
      fNumber: 1.8,
      fNumberAtMax: null,
      preferredFNumber: 'auto',
      multiplier: null,
    });
    const r = await saveEntity(repos.rigs(), {
      name: 'Rig',
      cameraId: 'c',
      opticsIds: [o.id],
      mountId: null,
      filterIds: [],
    });
    await deleteEquipment('optics', o.id);
    expect((await repos.rigs().get(r.id))?.opticsIds).toEqual([]);
  });

  it('exports and restores all user data (replace)', async () => {
    await userDb().journal.put(journal());
    await userDb().favorites.put({ objectId: 'ongc:NGC0224', addedAt: 1, note: '' });
    await userDb().journalImages.put({
      id: 'img1',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      mime: 'image/png',
      size: 3,
      createdAt: 1,
    });
    await updateSettings({ language: 'tr' });
    const backup = JSON.parse(
      JSON.stringify(
        await exportBackup([{ id: 'dso-core', version: 'x', installedAt: 1 }], '0.1.0'),
      ),
    );

    setUserDbForTests(new UserDb(`user-${Math.random()}`));
    await userDb().favorites.put({
      objectId: 'ongc:NGC0001',
      addedAt: 1,
      note: 'will be replaced',
    });
    const res = await importBackup(backup, 'replace');
    expect(res.counts.journal).toBe(1);
    expect(await userDb().favorites.count()).toBe(1);
    expect((await userDb().journal.get('j1'))?.targetName).toBe('M 31');
    const img = await userDb().journalImages.get('img1');
    expect(img?.size).toBe(3);
    expect((await getSettings()).language).toBe('tr');
  });

  it('merges without deleting existing records', async () => {
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    await userDb().favorites.put({ objectId: 'ongc:NGC0001', addedAt: 1, note: '' });
    backup.tables.favorites = [{ objectId: 'ongc:NGC0224', addedAt: 2, note: '' }];
    await importBackup(backup, 'merge');
    expect(await userDb().favorites.count()).toBe(2);
  });

  it('rejects invalid files without touching data', async () => {
    await userDb().favorites.put({ objectId: 'keep', addedAt: 1, note: '' });
    await expect(importBackup({ format: 'nope' }, 'replace')).rejects.toThrow('wrong-format');
    await expect(
      importBackup({ format: 'astrotrack-backup', version: 99, tables: {} }, 'replace'),
    ).rejects.toThrow('unsupported-version');
    await expect(
      importBackup(
        { format: 'astrotrack-backup', version: 1, tables: { favorites: [{ bad: 1 }] } },
        'replace',
      ),
    ).rejects.toThrow('bad-record');
    expect(await userDb().favorites.count()).toBe(1);
    expect(() => validateBackup(null)).toThrow();
  });

  it('exports the journal as CSV with proper escaping', () => {
    const csv = journalToCsv([journal()]);
    const [header, row] = csv.trim().split('\r\n');
    expect(header.startsWith('date,targetName,locationName')).toBe(true);
    expect(row).toContain('"Home, ""backyard"""');
    expect(row).toContain('"line1\nline2"'.replace('\n', '\n'));
    expect(row).toContain(',88,');
  });
});
