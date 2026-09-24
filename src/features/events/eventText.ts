import type { SkyEvent } from '../../astro/events';
import type { I18n } from '../../i18n/i18n';

const SOLAR_BODIES = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
];

export function bodyName(i18n: I18n, name: string): string {
  return SOLAR_BODIES.includes(name) ? i18n.td(`bodies.${name}`) : name;
}

export function eventTitle(i18n: I18n, e: SkyEvent): string {
  const kind = i18n.td(`events.kind.${e.kind}`);
  switch (e.kind) {
    case 'moon-phase':
      return i18n.td(`moonPhase.${String(e.data.phase)}`);
    case 'lunar-eclipse':
    case 'solar-eclipse':
      return `${kind} (${i18n.td(`events.eclipseKind.${String(e.data.eclipseKind)}`)})`;
    case 'meteor-shower':
      return `${kind}: ${e.bodies[0]}`;
    case 'moon-conjunction':
    case 'occultation':
      return `${kind}: ${e.bodies
        .filter((b) => b !== 'Moon')
        .map((b) => bodyName(i18n, b))
        .join(' – ')}`;
    default:
      return `${kind}: ${e.bodies.map((b) => bodyName(i18n, b)).join(' – ')}`;
  }
}

export function eventDetails(i18n: I18n, e: SkyEvent): string[] {
  const { t, fmtNumber, fmtTime } = i18n;
  const out: string[] = [];
  const d = e.data;
  if (typeof d.separationDeg === 'number')
    out.push(t('events.separation', { sep: fmtNumber(d.separationDeg, 1) }));
  if (e.kind === 'elongation' && typeof d.elongationDeg === 'number')
    out.push(
      t('events.elongationValue', {
        side: d.side === 'east' ? t('events.east') : t('events.west'),
        deg: fmtNumber(d.elongationDeg, 1),
      }),
    );
  if (e.kind === 'opposition' && typeof d.mag === 'number')
    out.push(
      `${t('events.mag')} ${fmtNumber(d.mag, 1)} · ${fmtNumber(d.diameterArcsec as number, 1)}″`,
    );
  if (e.kind === 'meteor-shower') {
    out.push(t('events.zhr', { zhr: d.zhr as number }));
    if (typeof d.radiantAltDeg === 'number' && d.radiantAltDeg > -90)
      out.push(
        t('events.radiant', {
          alt: fmtNumber(d.radiantAltDeg, 0),
          time: fmtTime(d.bestTimeMs as number),
        }),
      );
    out.push(t('events.moonAtPeak', { illum: Math.round((d.moonIllumination as number) * 100) }));
  }
  if (e.kind === 'lunar-eclipse' && typeof d.semiTotalMin === 'number' && d.semiTotalMin > 0)
    out.push(t('events.eclipseDuration', { min: Math.round(d.semiTotalMin * 2) }));
  if (e.kind === 'solar-eclipse' && typeof d.localObscuration === 'number')
    out.push(t('events.localPartial', { pct: Math.round(d.localObscuration * 100) }));
  if (e.focalRange) out.push(t('events.suggestedFocal', { range: e.focalRange }));
  return out;
}
