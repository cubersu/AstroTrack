import type { GeoLocation } from '../astro/coordinates';

/** Istanbul (Kandilli Observatory area) — test fixture only. */
export const ISTANBUL: GeoLocation = { latDeg: 41.063, lonDeg: 29.062, elevationM: 130 };
/** A dark-ish site in central Anatolia (near TUG, Antalya) — test fixture only. */
export const SARIKIZ: GeoLocation = { latDeg: 36.8245, lonDeg: 30.3353, elevationM: 2500 };
/** Northern site with no astronomical night around the June solstice. */
export const OSLO: GeoLocation = { latDeg: 59.91, lonDeg: 10.75, elevationM: 20 };
/** Southern hemisphere site. */
export const SIDING_SPRING: GeoLocation = { latDeg: -31.273, lonDeg: 149.061, elevationM: 1165 };

import type { RigInput, TargetInput } from '../astro/scoring';

/**
 * Sample equipment fixture (Section 47): APS-C sensor with approximately
 * Canon EOS 200D dimensions, 6000×4000, 50 mm f/1.8, 18–55 mm, 18–200 mm,
 * tracking EQ mount without guiding, no filter. Test fixture only — the
 * product is not built around it.
 */
export const SAMPLE_RIG: RigInput = {
  camera: {
    sensorWidthMm: 22.3,
    sensorHeightMm: 14.9,
    resolutionX: 6000,
    resolutionY: 4000,
    color: 'color',
    kind: 'dslr',
    modification: 'stock',
  },
  optics: [
    { id: 'p50', spec: { kind: 'lens', focalLengthMm: 50, fNumber: 1.8 } },
    {
      id: 'z1855',
      spec: {
        kind: 'lens',
        focalLengthMm: 18,
        focalLengthMaxMm: 55,
        fNumber: 3.5,
        fNumberAtMax: 5.6,
      },
    },
    {
      id: 'z18200',
      spec: {
        kind: 'lens',
        focalLengthMm: 18,
        focalLengthMaxMm: 200,
        fNumber: 3.5,
        fNumberAtMax: 6.3,
      },
    },
  ],
  mount: { tracking: true, equatorial: true, guiding: false },
  filters: [],
};

function t(
  p: Partial<TargetInput> & Pick<TargetInput, 'id' | 'type' | 'raDeg' | 'decDeg'>,
): TargetInput {
  return {
    majorArcmin: null,
    minorArcmin: null,
    positionAngleDeg: null,
    magV: null,
    magB: null,
    sbCatalogue: null,
    sbBand: null,
    ...p,
  };
}

/** Representative catalogue-like targets (values approximate, OpenNGC-style). */
export const TARGETS = {
  M31: t({
    id: 'M31',
    type: 'galaxy',
    raDeg: 10.6847,
    decDeg: 41.2687,
    majorArcmin: 177.8,
    minorArcmin: 69.7,
    positionAngleDeg: 35,
    magV: 3.44,
    magB: 4.36,
    sbCatalogue: 23.63,
    sbBand: 'B',
  }),
  M33: t({
    id: 'M33',
    type: 'galaxy',
    raDeg: 23.4621,
    decDeg: 30.6602,
    majorArcmin: 70.8,
    minorArcmin: 41.7,
    positionAngleDeg: 23,
    magV: 5.72,
    magB: 6.27,
    sbCatalogue: 23.9,
    sbBand: 'B',
  }),
  M45: t({
    id: 'M45',
    type: 'open-cluster',
    raDeg: 56.85,
    decDeg: 24.1167,
    majorArcmin: 110,
    magV: 1.6,
  }),
  NGC752: t({
    id: 'NGC752',
    type: 'open-cluster',
    raDeg: 29.42,
    decDeg: 37.785,
    majorArcmin: 50,
    magV: 5.7,
  }),
  M57: t({
    id: 'M57',
    type: 'planetary-nebula',
    raDeg: 283.396,
    decDeg: 33.029,
    majorArcmin: 1.4,
    minorArcmin: 1.0,
    magV: 8.8,
  }),
  NGC7000: t({
    id: 'NGC7000',
    type: 'hii-region',
    raDeg: 314.75,
    decDeg: 44.33,
    majorArcmin: 120,
    minorArcmin: 100,
  }),
  NGC7023: t({
    id: 'NGC7023',
    type: 'reflection-nebula',
    raDeg: 315.3975,
    decDeg: 68.1633,
    majorArcmin: 10,
    minorArcmin: 8,
    magV: 6.8,
  }),
  M42: t({
    id: 'M42',
    type: 'hii-region',
    raDeg: 83.8221,
    decDeg: -5.3911,
    majorArcmin: 85,
    minorArcmin: 60,
    magV: 4.0,
  }),
  OMEGA_CEN: t({
    id: 'NGC5139',
    type: 'globular-cluster',
    raDeg: 201.697,
    decDeg: -47.4795,
    majorArcmin: 36.3,
    magV: 3.9,
  }),
  TINY_GALAXY: t({
    id: 'IC9999',
    type: 'galaxy',
    raDeg: 15,
    decDeg: 35,
    majorArcmin: 0.6,
    minorArcmin: 0.4,
    magV: 14.5,
    magB: 15.3,
    sbCatalogue: 22.8,
    sbBand: 'B',
  }),
  STAR: t({ id: 'IC0001', type: 'star', raDeg: 2.1, decDeg: 27.7 }),
};
