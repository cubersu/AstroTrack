/** Small CRUD helpers over the user database. */
import type { Table } from 'dexie';
import { newId, userDb } from './userDb';
import type {
  CameraProfile,
  FilterProfile,
  MountProfile,
  ObservingLocation,
  OpticsProfile,
  RigProfile,
} from './types';

type WithTs = { id: string; createdAt: number; updatedAt: number };

export async function saveEntity<T extends WithTs>(
  table: Table<T, string>,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number },
): Promise<T> {
  const now = Date.now();
  const rec = {
    ...data,
    id: data.id ?? newId(),
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  } as T;
  await table.put(rec);
  return rec;
}

export const repos = {
  cameras: () => userDb().cameras as unknown as Table<CameraProfile, string>,
  optics: () => userDb().optics as unknown as Table<OpticsProfile, string>,
  mounts: () => userDb().mounts as unknown as Table<MountProfile, string>,
  filters: () => userDb().filters as unknown as Table<FilterProfile, string>,
  rigs: () => userDb().rigs as unknown as Table<RigProfile, string>,
  locations: () => userDb().locations as unknown as Table<ObservingLocation, string>,
};

/** Delete equipment and remove dangling references from rigs. */
export async function deleteEquipment(
  kind: 'cameras' | 'optics' | 'mounts' | 'filters',
  id: string,
) {
  const db = userDb();
  await db.transaction('rw', db[kind], db.rigs, async () => {
    await db[kind].delete(id);
    const rigs = await db.rigs.toArray();
    for (const r of rigs) {
      let changed = false;
      const next = { ...r };
      if (kind === 'optics' && r.opticsIds.includes(id)) {
        next.opticsIds = r.opticsIds.filter((x) => x !== id);
        changed = true;
      }
      if (kind === 'filters' && r.filterIds.includes(id)) {
        next.filterIds = r.filterIds.filter((x) => x !== id);
        changed = true;
      }
      if (kind === 'mounts' && r.mountId === id) {
        next.mountId = null;
        changed = true;
      }
      if (changed) await db.rigs.put({ ...next, updatedAt: Date.now() });
    }
  });
}

export async function isCameraInUse(id: string): Promise<boolean> {
  return (
    (await userDb()
      .rigs.filter((r) => r.cameraId === id)
      .count()) > 0
  );
}
