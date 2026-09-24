/** Resolve stored equipment entities into the engine's physical RigInput. */
import type { RigInput } from '../astro/scoring';
import { saveEntity, repos } from '../db/repo';
import type {
  CameraProfile,
  FilterProfile,
  MountProfile,
  OpticsProfile,
  RigProfile,
} from '../db/types';
import { userDb } from '../db/userDb';
import { updateSettings } from '../db/settings';

export interface EquipmentSet {
  cameras: CameraProfile[];
  optics: OpticsProfile[];
  mounts: MountProfile[];
  filters: FilterProfile[];
}

export function buildRigInput(rig: RigProfile | null, eq: EquipmentSet): RigInput | null {
  if (!rig) return null;
  const cam = eq.cameras.find((c) => c.id === rig.cameraId);
  if (!cam) return null;
  const optics = rig.opticsIds
    .map((id) => eq.optics.find((o) => o.id === id))
    .filter((o): o is OpticsProfile => !!o);
  const mount = rig.mountId ? eq.mounts.find((m) => m.id === rig.mountId) : undefined;
  const filters = rig.filterIds
    .map((id) => eq.filters.find((f) => f.id === id))
    .filter((f): f is FilterProfile => !!f);
  return {
    camera: {
      sensorWidthMm: cam.sensorWidthMm,
      sensorHeightMm: cam.sensorHeightMm,
      resolutionX: cam.resolutionX,
      resolutionY: cam.resolutionY,
      pixelPitchUm: cam.pixelPitchUm,
      color: cam.color,
      kind: cam.kind,
      modification: cam.modification,
      advanced: cam.advanced,
    },
    optics: optics.map((o) => ({
      id: o.id,
      spec: {
        kind: o.kind,
        focalLengthMm: o.focalLengthMm,
        focalLengthMaxMm: o.focalLengthMaxMm,
        apertureMm: o.apertureMm,
        fNumber: o.fNumber,
        fNumberAtMax: o.fNumberAtMax,
        preferredFNumber: o.preferredFNumber,
        multiplier: o.multiplier,
      },
    })),
    mount: mount
      ? {
          tracking: mount.tracking,
          equatorial: mount.equatorial,
          guiding: mount.guiding,
          payloadKg: mount.payloadKg,
          calibration: mount.calibration,
        }
      : { tracking: false, equatorial: false, guiding: false },
    filters: filters.map((f) => ({ id: f.id, spec: { kind: f.kind, bands: f.bands } })),
  };
}

/**
 * Convenience preset matching the acceptance-test sample (Section 47).
 * It only populates physical fields; users can edit or delete everything.
 */
export async function createSampleEquipment(names: {
  camera: string;
  prime: string;
  kit: string;
  zoom: string;
  mount: string;
  rig: string;
}): Promise<RigProfile> {
  const db = userDb();
  return db.transaction(
    'rw',
    [db.cameras, db.optics, db.mounts, db.rigs, db.settings],
    async () => {
      const cam = await saveEntity(repos.cameras(), {
        name: names.camera,
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
      const common = {
        kind: 'lens' as const,
        apertureMm: null,
        preferredFNumber: 'auto' as const,
        multiplier: null,
      };
      const p50 = await saveEntity(repos.optics(), {
        ...common,
        name: names.prime,
        focalLengthMm: 50,
        focalLengthMaxMm: null,
        fNumber: 1.8,
        fNumberAtMax: null,
      });
      const kit = await saveEntity(repos.optics(), {
        ...common,
        name: names.kit,
        focalLengthMm: 18,
        focalLengthMaxMm: 55,
        fNumber: 3.5,
        fNumberAtMax: 5.6,
      });
      const zoom = await saveEntity(repos.optics(), {
        ...common,
        name: names.zoom,
        focalLengthMm: 18,
        focalLengthMaxMm: 200,
        fNumber: 3.5,
        fNumberAtMax: 6.3,
      });
      const mount = await saveEntity(repos.mounts(), {
        name: names.mount,
        tracking: true,
        equatorial: true,
        guiding: false,
        payloadKg: null,
        calibration: [],
      });
      const rig = await saveEntity(repos.rigs(), {
        name: names.rig,
        cameraId: cam.id,
        opticsIds: [p50.id, kit.id, zoom.id],
        mountId: mount.id,
        filterIds: [],
      });
      await updateSettings({ activeRigId: rig.id });
      return rig;
    },
  );
}
