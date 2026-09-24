/** Pure validation for equipment forms (unit-tested). Returns i18n keys per field. */
import type { CameraProfile, OpticsProfile } from '../../db/types';

export type Errors<T> = Partial<Record<keyof T, string>>;

const pos = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function validateCamera(c: Partial<CameraProfile>): Errors<CameraProfile> {
  const e: Errors<CameraProfile> = {};
  if (!c.name?.trim()) e.name = 'common.required';
  if (!pos(c.sensorWidthMm) || c.sensorWidthMm! > 100) e.sensorWidthMm = 'common.invalidNumber';
  if (!pos(c.sensorHeightMm) || c.sensorHeightMm! > 100) e.sensorHeightMm = 'common.invalidNumber';
  if (!pos(c.resolutionX) || !Number.isInteger(c.resolutionX))
    e.resolutionX = 'common.invalidNumber';
  if (!pos(c.resolutionY) || !Number.isInteger(c.resolutionY))
    e.resolutionY = 'common.invalidNumber';
  if (c.pixelPitchUm != null && (!pos(c.pixelPitchUm) || c.pixelPitchUm > 50))
    e.pixelPitchUm = 'common.invalidNumber';
  return e;
}

export function validateOptics(o: Partial<OpticsProfile>, zoom: boolean): Errors<OpticsProfile> {
  const e: Errors<OpticsProfile> = {};
  if (!o.name?.trim()) e.name = 'common.required';
  if (!pos(o.focalLengthMm)) e.focalLengthMm = 'equipment.optics.needFocal';
  if (zoom && (!pos(o.focalLengthMaxMm) || o.focalLengthMaxMm! <= (o.focalLengthMm ?? 0)))
    e.focalLengthMaxMm = 'common.invalidNumber';
  if (!pos(o.apertureMm) && !pos(o.fNumber)) e.fNumber = 'equipment.optics.needAperture';
  if (o.fNumber != null && !pos(o.fNumber)) e.fNumber = 'common.invalidNumber';
  if (o.multiplier != null && (!pos(o.multiplier) || o.multiplier > 5))
    e.multiplier = 'common.invalidNumber';
  if (typeof o.preferredFNumber === 'number' && !pos(o.preferredFNumber))
    e.preferredFNumber = 'common.invalidNumber';
  return e;
}

export function hasErrors(e: object): boolean {
  return Object.keys(e).length > 0;
}
