import { describe, expect, it } from 'vitest';
import { hasErrors, validateCamera, validateOptics } from './validation';
import { validateLocation } from '../locations/LocationsPage';

describe('equipment validation', () => {
  it('validates cameras', () => {
    expect(
      hasErrors(
        validateCamera({
          name: 'x',
          sensorWidthMm: 22.3,
          sensorHeightMm: 14.9,
          resolutionX: 6000,
          resolutionY: 4000,
        }),
      ),
    ).toBe(false);
    const e = validateCamera({
      name: '',
      sensorWidthMm: 0,
      sensorHeightMm: 14.9,
      resolutionX: 6000.5,
      resolutionY: 4000,
      pixelPitchUm: -1,
    });
    expect(Object.keys(e).sort()).toEqual(['name', 'pixelPitchUm', 'resolutionX', 'sensorWidthMm']);
  });
  it('validates optics (aperture or f-number required, zoom range order)', () => {
    expect(hasErrors(validateOptics({ name: 'L', focalLengthMm: 50, fNumber: 1.8 }, false))).toBe(
      false,
    );
    expect(validateOptics({ name: 'L', focalLengthMm: 50 }, false).fNumber).toBe(
      'equipment.optics.needAperture',
    );
    expect(
      validateOptics({ name: 'Z', focalLengthMm: 55, focalLengthMaxMm: 18, fNumber: 3.5 }, true)
        .focalLengthMaxMm,
    ).toBeDefined();
    expect(
      hasErrors(
        validateOptics({ name: 'T', focalLengthMm: 1000, apertureMm: 200, multiplier: 0.8 }, false),
      ),
    ).toBe(false);
  });
  it('validates locations', () => {
    const base = {
      name: 'X',
      latDeg: 41,
      lonDeg: 29,
      elevationM: null,
      timeZone: null,
      bortleManual: null,
      sqmManual: null,
      atlasSqm: null,
      notes: '',
    };
    expect(validateLocation(base)).toEqual({});
    expect(validateLocation({ ...base, latDeg: 95 }).latDeg).toBe('locations.invalidLat');
    expect(validateLocation({ ...base, lonDeg: Number.NaN }).lonDeg).toBe('locations.invalidLon');
    expect(validateLocation({ ...base, sqmManual: 30 }).sqmManual).toBeDefined();
  });
});
