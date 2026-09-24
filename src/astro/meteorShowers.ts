/**
 * Major annual meteor showers. Peak solar longitudes (J2000), ZHR, radiant
 * and geocentric velocity follow the IMO Meteor Shower Calendar working list
 * (approximate; actual peaks vary by ±1 day and ZHRs vary year to year).
 * Solar-longitude based peaks make the table valid for any year.
 */
export interface MeteorShower {
  code: string;
  name: string;
  peakSolarLonDeg: number;
  zhr: number;
  radiantRaDeg: number;
  radiantDecDeg: number;
  velocityKms: number;
  /** Activity period as solar-longitude span (approximate). */
  activeFromLonDeg: number;
  activeToLonDeg: number;
}

export const METEOR_SHOWERS: MeteorShower[] = [
  {
    code: 'QUA',
    name: 'Quadrantids',
    peakSolarLonDeg: 283.15,
    zhr: 80,
    radiantRaDeg: 230,
    radiantDecDeg: 49,
    velocityKms: 41,
    activeFromLonDeg: 276,
    activeToLonDeg: 291,
  },
  {
    code: 'LYR',
    name: 'Lyrids',
    peakSolarLonDeg: 32.32,
    zhr: 18,
    radiantRaDeg: 271,
    radiantDecDeg: 34,
    velocityKms: 49,
    activeFromLonDeg: 24,
    activeToLonDeg: 40,
  },
  {
    code: 'ETA',
    name: 'η-Aquariids',
    peakSolarLonDeg: 45.5,
    zhr: 50,
    radiantRaDeg: 338,
    radiantDecDeg: -1,
    velocityKms: 66,
    activeFromLonDeg: 29,
    activeToLonDeg: 67,
  },
  {
    code: 'SDA',
    name: 'Southern δ-Aquariids',
    peakSolarLonDeg: 127,
    zhr: 25,
    radiantRaDeg: 340,
    radiantDecDeg: -16,
    velocityKms: 41,
    activeFromLonDeg: 110,
    activeToLonDeg: 150,
  },
  {
    code: 'PER',
    name: 'Perseids',
    peakSolarLonDeg: 140.0,
    zhr: 100,
    radiantRaDeg: 48,
    radiantDecDeg: 58,
    velocityKms: 59,
    activeFromLonDeg: 115,
    activeToLonDeg: 151,
  },
  {
    code: 'DRA',
    name: 'Draconids',
    peakSolarLonDeg: 195.4,
    zhr: 10,
    radiantRaDeg: 262,
    radiantDecDeg: 54,
    velocityKms: 20,
    activeFromLonDeg: 193,
    activeToLonDeg: 198,
  },
  {
    code: 'ORI',
    name: 'Orionids',
    peakSolarLonDeg: 208,
    zhr: 20,
    radiantRaDeg: 95,
    radiantDecDeg: 16,
    velocityKms: 66,
    activeFromLonDeg: 189,
    activeToLonDeg: 225,
  },
  {
    code: 'NTA',
    name: 'Northern Taurids',
    peakSolarLonDeg: 230,
    zhr: 5,
    radiantRaDeg: 58,
    radiantDecDeg: 22,
    velocityKms: 29,
    activeFromLonDeg: 205,
    activeToLonDeg: 250,
  },
  {
    code: 'LEO',
    name: 'Leonids',
    peakSolarLonDeg: 235.27,
    zhr: 15,
    radiantRaDeg: 152,
    radiantDecDeg: 22,
    velocityKms: 71,
    activeFromLonDeg: 224,
    activeToLonDeg: 248,
  },
  {
    code: 'GEM',
    name: 'Geminids',
    peakSolarLonDeg: 262.2,
    zhr: 150,
    radiantRaDeg: 112,
    radiantDecDeg: 33,
    velocityKms: 35,
    activeFromLonDeg: 252,
    activeToLonDeg: 268,
  },
  {
    code: 'URS',
    name: 'Ursids',
    peakSolarLonDeg: 270.7,
    zhr: 10,
    radiantRaDeg: 217,
    radiantDecDeg: 76,
    velocityKms: 33,
    activeFromLonDeg: 265,
    activeToLonDeg: 275,
  },
];
