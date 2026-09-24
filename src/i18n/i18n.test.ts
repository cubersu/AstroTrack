import { describe, expect, it } from 'vitest';
import { interpolate, translate } from './i18n';
import { en } from './locales/en';
import { tr } from './locales/tr';

function leaves(o: unknown, p = ''): string[] {
  if (typeof o === 'string') return [p];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, p ? `${p}.${k}` : k),
  );
}

describe('i18n', () => {
  it('resolves keys containing dots', () => {
    expect(translate('en', 'reasons.altitude.high', { alt: 45, pct: 80, meanAlt: 60 })).toBe(
      'Above 45° for 80% of the imaging window (mean 60°)',
    );
    expect(translate('tr', 'reasons.moon.down', { illum: 12 })).toContain('%12');
  });
  it('interpolates and pluralises', () => {
    expect(interpolate('a {x} b', { x: 1 })).toBe('a 1 b');
    expect(translate('en', 'explore.results', { count: 1 })).toBe('1 object');
    expect(translate('en', 'explore.results', { count: 5 })).toBe('5 objects');
    expect(translate('tr', 'explore.results', { count: 5 })).toBe('5 nesne');
  });
  it('falls back to English, then to the key', () => {
    expect(translate('tr', 'nope.missing')).toBe('nope.missing');
  });
  it('Turkish provides every English key and no empty strings', () => {
    const e = leaves(en).sort();
    const t = leaves(tr).sort();
    expect(t).toEqual(e);
    for (const k of t) expect(translate('tr', k).length).toBeGreaterThan(0);
  });
  it('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of leaves(en)) expect(ph(translate('tr', k)), k).toBe(ph(translate('en', k)));
  });
});
