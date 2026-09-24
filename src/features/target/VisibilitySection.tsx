import { useMemo } from 'react';
import { compassPoint, equatorialToHorizontal } from '../../astro/coordinates';
import { j2000ToOfDate, lstDeg, precessionMatrix } from '../../astro/ephemeris';
import { airmass } from '../../astro/airmass';
import { formatDec, formatRa } from '../../astro/units';
import type { DsoSummary } from '../../catalog/types';
import { useApp } from '../../app/AppState';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { useNow } from '../../ui/hooks';
import type { EvaluateResponse } from '../../workers/serviceTypes';
import { AltitudeChart } from '../common/AltitudeChart';

/** Current horizontal position of a J2000 target (for target-finding help). */
export function useCurrentPosition(s: DsoSummary | null) {
  const { location } = useApp();
  const now = useNow(30_000);
  return useMemo(() => {
    if (!s || !location) return null;
    const pm = precessionMatrix(now);
    const pod = j2000ToOfDate({ raDeg: s.raDeg, decDeg: s.decDeg }, pm);
    const lst = lstDeg(now, location.lonDeg);
    const h = equatorialToHorizontal(pod.raDeg, pod.decDeg, location.latDeg, lst);
    const later = equatorialToHorizontal(pod.raDeg, pod.decDeg, location.latDeg, lst + 0.25);
    return { ...h, pod, rising: later.altDeg > h.altDeg, airmass: airmass(h.altDeg), now };
  }, [s, location, now]);
}

export function SkyDome({
  alt,
  az,
  path,
  label,
}: {
  alt: number;
  az: number;
  path?: Array<[number, number]>;
  label: string;
}) {
  const { t } = useI18n();
  const R = 90;
  const toXY = (a: number, z: number) => {
    const r = ((90 - Math.max(0, a)) / 90) * R;
    const th = (z * Math.PI) / 180;
    // Looking up at the sky: north at the top, east on the LEFT.
    return [100 - r * Math.sin(th), 100 - r * Math.cos(th)];
  };
  const [x, y] = toXY(alt, az);
  const pts = (path ?? [])
    .filter(([a]) => a > 0)
    .map(([a, z]) =>
      toXY(a, z)
        .map((v) => v.toFixed(1))
        .join(','),
    );
  return (
    <svg
      className="media"
      viewBox="0 0 200 200"
      width="200"
      height="200"
      role="img"
      aria-label={label}
    >
      <circle cx="100" cy="100" r={R} fill="none" stroke="var(--chart-grid)" />
      <circle
        cx="100"
        cy="100"
        r={(60 / 90) * R}
        fill="none"
        stroke="var(--chart-grid)"
        strokeDasharray="2 3"
      />
      <circle
        cx="100"
        cy="100"
        r={(30 / 90) * R}
        fill="none"
        stroke="var(--chart-grid)"
        strokeDasharray="2 3"
      />
      {(['N', 'E', 'S', 'W'] as const).map((c, i) => {
        const [cx, cy] = toXY(-2, i * 90);
        return (
          <text key={c} x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill="var(--fg-muted)">
            {t(`compass.${c}` as TKey)}
          </text>
        );
      })}
      {pts.length > 1 && (
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="var(--chart-target)"
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
      )}
      {alt > 0 && <circle cx={x} cy={y} r="5" fill="var(--chart-target)" />}
    </svg>
  );
}

export function VisibilitySection({
  ev,
  summary,
}: {
  ev: EvaluateResponse | null;
  summary: DsoSummary;
}) {
  const { t, fmtTime, fmtNumber, fmtDuration } = useI18n();
  const app = useApp();
  const cur = useCurrentPosition(summary);
  const vis = ev?.evaluation.visibility;
  const curves = ev?.curves;
  const path = useMemo(() => {
    if (!curves || !app.location || !vis) return undefined;
    return curves.times.map((ms, i) => {
      const h = equatorialToHorizontal(
        vis.posOfDate.raDeg,
        vis.posOfDate.decDeg,
        app.location!.latDeg,
        lstDeg(ms, app.location!.lonDeg),
      );
      return [curves.targetAlt[i], h.azDeg] as [number, number];
    });
  }, [curves, vis, app.location]);
  return (
    <section className="card" aria-labelledby="vis-h">
      <h2 id="vis-h">{t('target.visibility')}</h2>
      {curves && (
        <AltitudeChart
          times={curves.times}
          targetAlt={curves.targetAlt}
          moonAlt={curves.moonAlt}
          sunAlt={curves.sunAlt}
          dark={curves.dark}
          minAltDeg={app.settings.scoring.minAltitudeDeg}
          nowMs={Date.now()}
          windowStartMs={ev?.evaluation.window?.startMs ?? null}
          windowEndMs={ev?.evaluation.window?.endMs ?? null}
        />
      )}
      <div className="grid two" style={{ marginTop: '0.75rem' }}>
        <dl className="kv">
          {vis && (
            <>
              {vis.rts.neverRises ? (
                <>
                  <dt>{t('target.rise')}</dt>
                  <dd>{t('target.neverRises')}</dd>
                </>
              ) : vis.rts.circumpolar ? (
                <>
                  <dt>{t('target.rise')}</dt>
                  <dd>{t('target.circumpolar')}</dd>
                </>
              ) : (
                <>
                  <dt>{t('target.rise')}</dt>
                  <dd>{vis.rts.riseMs ? fmtTime(vis.rts.riseMs) : '—'}</dd>
                  <dt>{t('target.set')}</dt>
                  <dd>{vis.rts.setMs ? fmtTime(vis.rts.setMs) : '—'}</dd>
                </>
              )}
              <dt>{t('target.transit')}</dt>
              <dd>
                {fmtTime(vis.rts.transitMs)} ({fmtNumber(vis.rts.transitAltDeg, 0)}°)
              </dd>
              <dt>{t('target.maxAltTonight')}</dt>
              <dd>{vis.maxDarkAltDeg > -90 ? `${fmtNumber(vis.maxDarkAltDeg, 0)}°` : '—'}</dd>
              <dt>{t('target.darkHoursAbove', { alt: app.settings.scoring.minAltitudeDeg })}</dt>
              <dd>{fmtDuration(vis.darkHoursAboveMin)}</dd>
            </>
          )}
          {ev?.evaluation.window && (
            <>
              <dt>{t('target.bestWindow')}</dt>
              <dd>
                {fmtTime(ev.evaluation.window.startMs)}–{fmtTime(ev.evaluation.window.endMs)}
              </dd>
            </>
          )}
        </dl>
        {cur && (
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <SkyDome alt={cur.altDeg} az={cur.azDeg} path={path} label={t('target.skyPosition')} />
            <dl className="kv">
              <dt>{t('target.now')}</dt>
              <dd>{fmtTime(cur.now)}</dd>
              <dt>{t('target.altitude')}</dt>
              <dd>{fmtNumber(cur.altDeg, 1)}°</dd>
              <dt>{t('target.azimuth')}</dt>
              <dd>
                {fmtNumber(cur.azDeg, 1)}° ({t(`compass.${compassPoint(cur.azDeg)}` as TKey)})
              </dd>
              <dt>{t('target.direction')}</dt>
              <dd>
                {cur.altDeg < 0
                  ? t('target.belowHorizon')
                  : cur.rising
                    ? t('target.rising')
                    : t('target.setting')}
              </dd>
              {cur.altDeg > 0 && (
                <>
                  <dt>{t('target.airmass')}</dt>
                  <dd>{fmtNumber(cur.airmass, 2)}</dd>
                </>
              )}
              <dt>
                {t('target.ra')} / {t('target.dec')} ({t('target.ofDate')})
              </dt>
              <dd className="mono small">
                {formatRa(cur.pod.raDeg)} {formatDec(cur.pod.decDeg)}
              </dd>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
