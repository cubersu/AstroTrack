import { describe, expect, it } from 'vitest';
import {
  formatDec,
  formatRa,
  interpolateTable,
  norm180,
  norm360,
  normHours12,
  parseDecDms,
  parseRaHms,
} from './units';

describe('units', () => {
  it('normalises angles', () => {
    expect(norm360(-10)).toBeCloseTo(350);
    expect(norm360(725)).toBeCloseTo(5);
    expect(norm180(190)).toBeCloseTo(-170);
    expect(normHours12(13)).toBeCloseTo(-11);
    expect(normHours12(-13)).toBeCloseTo(11);
  });
  it('parses sexagesimal coordinates', () => {
    expect(parseRaHms('00:42:44.3')).toBeCloseTo(10.6846, 3);
    expect(parseDecDms('+41:16:09')).toBeCloseTo(41.2692, 3);
    expect(parseDecDms('-05:23:28')).toBeCloseTo(-5.3911, 3);
    expect(parseDecDms('-00:30:00')).toBeCloseTo(-0.5, 6);
  });
  it('formats coordinates', () => {
    expect(formatRa(10.6846)).toBe('00h 42m 44.3s');
    expect(formatDec(41.2692)).toBe('+41° 16′ 09″');
    expect(formatDec(-0.5)).toBe('−00° 30′ 00″');
  });
  it('interpolates tables and clamps', () => {
    const t = [
      [0, 0],
      [10, 100],
    ] as const;
    expect(interpolateTable(t, -5)).toBe(0);
    expect(interpolateTable(t, 5)).toBe(50);
    expect(interpolateTable(t, 50)).toBe(100);
  });
});
