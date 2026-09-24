import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogApi } from '../../app/catalogClient';
import { Link, navigate } from '../../app/router';
import { angularSeparationDeg, compassPoint } from '../../astro/coordinates';
import { bodyPosition } from '../../astro/ephemeris';
import { nightDateForInstant } from '../../astro/time';
import type { DsoSummary } from '../../catalog/types';
import type { ActiveSession, JournalEntry } from '../../db/types';
import { newId, userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { EmptyState, Field, NumberInput } from '../../ui/controls';
import { useLiveQuery, useNow } from '../../ui/hooks';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toast';
import type { EvaluateResponse } from '../../workers/serviceTypes';
import { availableHoursFromSettings, geo } from '../common/nightHooks';
import { useCurrentPosition } from '../target/VisibilitySection';
import { weatherBadgeClass } from '../common/WeatherViews';

export function sessionToJournal(s: ActiveSession, extra: Partial<JournalEntry>): JournalEntry {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    date: new Date(s.startedAt).toISOString().slice(0, 10),
    locationName: '',
    latDeg: null,
    lonDeg: null,
    targetId: s.targetId,
    targetName: s.targetName,
    cameraName: '',
    opticsName: '',
    focalLengthMm: s.focalLengthMm,
    fNumber: s.fNumber,
    exposureMode: 'tracking',
    filterName: '',
    isoGain: s.isoGain,
    subExposureS: s.subExposureS,
    lightCount: s.completedLights,
    totalIntegrationS: s.completedLights * s.subExposureS,
    darks: null,
    flats: null,
    bias: null,
    darkFlats: null,
    bortle: null,
    sqm: null,
    weather: null,
    rating: null,
    notes: s.notes,
    trailing: null,
    imageId: null,
    planId: s.planId,
    useForMountCalibration: false,
    mountId: null,
    ...extra,
  };
}

export function SessionPage() {
  const { t, fmtTime, fmtNumber, fmtDuration } = useI18n();
  const app = useApp();
  const toast = useToast();
  const now = useNow(15_000);
  const session = useLiveQuery(() => userDb().session.get('active'), [], undefined);
  const [summary, setSummary] = useState<DsoSummary | null>(null);
  const [ev, setEv] = useState<EvaluateResponse | null>(null);
  const cur = useCurrentPosition(summary);
  const fiveMinuteTick = Math.floor(now / 300_000);

  useEffect(() => {
    if (!session || !app.catalogue.ready) return;
    let alive = true;
    catalogApi()
      .summaries([session.targetId])
      .then((s) => alive && setSummary(s[0] ?? null));
    return () => {
      alive = false;
    };
  }, [session?.targetId, app.catalogue.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session || !app.location || !app.rigInput || !app.catalogue.ready) return;
    let alive = true;
    catalogApi()
      .evaluate({
        id: session.targetId,
        location: geo(app.location),
        date: nightDateForInstant(Date.now(), app.location.lonDeg),
        rig: app.rigInput,
        sky: app.sky,
        settings: app.settings.scoring,
        exposureMode: app.settings.exposureMode,
        timeMode: 'now',
        nowMs: Date.now(),
        availableHours: availableHoursFromSettings(app.settings),
        weather: app.weather.input,
        weatherEnabled: app.settings.weatherEnabled === true,
      })
      .then((r) => alive && setEv(r));
    return () => {
      alive = false;
    };
    // Re-evaluate when the target, site or equipment changes, and every 5 minutes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.targetId, app.location, app.rigInput, app.catalogue.ready, fiveMinuteTick]);

  const moon = useMemo(() => {
    if (!app.location || !cur) return null;
    const m = bodyPosition('Moon', now, geo(app.location));
    return {
      alt: m.altDeg,
      sep: angularSeparationDeg(m.raDeg, m.decDeg, cur.pod.raDeg, cur.pod.decDeg),
    };
  }, [app.location, cur, now]);
  const hour = app.weather.hourly?.find((h) => Math.abs(h.timeMs - now) < 1800_000) ?? null;

  if (session === undefined) return null;
  if (!session)
    return (
      <div>
        <div className="page-header">
          <h1>{t('session.title')}</h1>
          <p>{t('session.subtitle')}</p>
        </div>
        <EmptyState>
          {t('session.none')}
          <div style={{ marginTop: '0.75rem' }}>
            <Link className="btn" to="/tonight">
              {t('nav.tonight')}
            </Link>
          </div>
        </EmptyState>
      </div>
    );

  const upd = (patch: Partial<ActiveSession>) => void userDb().session.update('active', patch);
  const achievedH = (session.completedLights * session.subExposureS) / 3600;
  const integ = ev?.evaluation.integration;
  const win = ev?.evaluation.window;

  return (
    <div>
      <div className="page-header">
        <h1>{t('session.title')}</h1>
        <p>{t('session.subtitle')}</p>
      </div>
      {app.settings.theme !== 'night' && app.settings.nightVisionSuggest && (
        <div className="card notice row between">
          <span className="small">{t('session.nightVisionSuggest')}</span>
          <button
            type="button"
            className="btn small primary"
            onClick={() => void app.update({ theme: 'night' })}
          >
            <Icon name="eye" /> {t('session.switchNight')}
          </button>
        </div>
      )}
      <section className="card">
        <h2>
          <Link to={`/target/${encodeURIComponent(session.targetId)}`}>{session.targetName}</Link>
        </h2>
        <div className="stats">
          <div className="stat">
            <span className="l">{t('session.altNow')}</span>
            <span className="session-big">{cur ? `${fmtNumber(cur.altDeg, 0)}°` : '—'}</span>
            {cur && (
              <span className="l">
                {cur.altDeg < 0
                  ? t('target.belowHorizon')
                  : cur.rising
                    ? t('target.rising')
                    : t('target.setting')}
              </span>
            )}
          </div>
          <div className="stat">
            <span className="l">{t('session.azNow')}</span>
            <span className="session-big">{cur ? `${fmtNumber(cur.azDeg, 0)}°` : '—'}</span>
            {cur && <span className="l">{t(`compass.${compassPoint(cur.azDeg)}` as TKey)}</span>}
          </div>
          <div className="stat">
            <span className="l">{t('session.remaining')}</span>
            <span className="v">
              {win
                ? now < win.startMs
                  ? t('session.windowNotStarted', { time: fmtTime(win.startMs) })
                  : now > win.endMs
                    ? t('session.windowOver')
                    : fmtDuration((win.endMs - now) / 3600_000)
                : '—'}
            </span>
          </div>
          <div className="stat">
            <span className="l">{t('session.moonStatus')}</span>
            <span className="v" style={{ fontSize: '0.95rem' }}>
              {moon
                ? moon.alt > 0
                  ? t('session.moonUp', {
                      alt: fmtNumber(moon.alt, 0),
                      sep: fmtNumber(moon.sep, 0),
                    })
                  : t('session.moonDown')
                : '—'}
            </span>
          </div>
          {hour && (
            <div className="stat">
              <span className="l">{t('session.weatherNow')}</span>
              <span className={`badge ${hour.hardStop ? 'bad' : weatherBadgeClass(hour.score)}`}>
                {hour.hardStop
                  ? t('weather.hardStop')
                  : `${fmtNumber(hour.score, 0)} — ${t(`weather.label.${hour.label}` as TKey)}`}
              </span>
              {hour.dewSpreadC != null && (
                <span className="l">
                  {t('session.dewNow')}: {fmtNumber(hour.dewSpreadC, 1)} °C{' '}
                  {hour.humidity !== 'none' ? '⚠' : ''}
                </span>
              )}
            </div>
          )}
          <div className="stat">
            <span className="l">{t('session.elapsed')}</span>
            <span className="v">{fmtDuration((now - session.startedAt) / 3600_000)}</span>
          </div>
        </div>
        {cur && (
          <p className="tiny muted mono" style={{ marginTop: '0.5rem' }}>
            {t('target.ra')}/{t('target.dec')} ({t('target.ofDate')}):{' '}
            {fmtNumber(cur.pod.raDeg / 15, 4)}h / {fmtNumber(cur.pod.decDeg, 3)}°
          </p>
        )}
      </section>
      <section className="card">
        <div className="row" style={{ gap: '1.5rem' }}>
          <Field label={t('session.sub')}>
            {(id) => (
              <NumberInput
                id={id}
                value={session.subExposureS}
                min={0.1}
                onChange={(v) => v && upd({ subExposureS: v })}
              />
            )}
          </Field>
          <Field label={t('session.planned')}>
            {(id) => (
              <NumberInput
                id={id}
                value={session.plannedLights}
                min={1}
                step={1}
                onChange={(v) => v && upd({ plannedLights: Math.round(v) })}
              />
            )}
          </Field>
        </div>
        <div className="counter" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn"
            aria-label={t('session.removeOne')}
            onClick={() => upd({ completedLights: Math.max(0, session.completedLights - 1) })}
          >
            −
          </button>
          <div className="stack" style={{ alignItems: 'center', minWidth: 120 }}>
            <span className="session-big" aria-live="polite">
              {session.completedLights}
            </span>
            <span className="tiny muted">
              {t('session.completed')} / {session.plannedLights}
            </span>
          </div>
          <button
            type="button"
            className="btn primary"
            aria-label={t('session.addOne')}
            onClick={() => upd({ completedLights: session.completedLights + 1 })}
          >
            +
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => upd({ completedLights: session.completedLights + 10 })}
          >
            {t('session.add10')}
          </button>
        </div>
        <p style={{ marginTop: '0.75rem' }}>
          <strong>{t('session.achieved')}:</strong> {fmtDuration(achievedH)}
        </p>
        {integ && (
          <div className="stack">
            {(
              [
                ['minimum', integ.minimumH],
                ['recommended', integ.recommendedH],
                ['ideal', integ.idealH],
              ] as const
            ).map(([k, h]) => (
              <div key={k}>
                <div className="row between small">
                  <span>{t(`recipe.${k}` as TKey)}</span>
                  <span>
                    {fmtDuration(achievedH)} / {fmtDuration(h)}
                  </span>
                </div>
                <div
                  className="bar"
                  role="progressbar"
                  aria-label={t(`recipe.${k}` as TKey)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, (achievedH / h) * 100))}
                >
                  <span style={{ width: `${Math.min(100, (achievedH / h) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="card">
        <Field label={t('session.notes')}>
          {(id) => (
            <textarea
              id={id}
              value={session.notes}
              onChange={(e) => upd({ notes: e.target.value })}
            />
          )}
        </Field>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn primary"
            onClick={async () => {
              const rig = app.rig;
              const cam = app.equipment.cameras.find((c) => c.id === rig?.cameraId);
              const opt = app.equipment.optics.find((o) => o.id === session.opticsId);
              const entry = sessionToJournal(session, {
                locationName: app.location?.name ?? '',
                latDeg: app.location?.latDeg ?? null,
                lonDeg: app.location?.lonDeg ?? null,
                cameraName: cam?.name ?? '',
                opticsName: opt?.name ?? '',
                exposureMode: app.settings.exposureMode,
                bortle: app.sky.source === 'assumed' ? null : app.sky.bortle,
                sqm: app.location?.sqmManual ?? null,
                mountId: rig?.mountId ?? null,
                weather: hour
                  ? {
                      capturedAt: Date.now(),
                      score: hour.score,
                      cloudPct: hour.ceff,
                      temperatureC: null,
                      humidityPct: null,
                      windKmh: hour.windEff,
                    }
                  : null,
              });
              await userDb().journal.put(entry);
              await userDb().session.delete('active');
              toast(t('session.saved'));
              navigate(`/journal?edit=${entry.id}`);
            }}
          >
            <Icon name="book" /> {t('session.saveJournal')}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (window.confirm(t('session.confirmDiscard')))
                await userDb().session.delete('active');
            }}
          >
            <Icon name="stop" /> {t('session.discard')}
          </button>
        </div>
      </section>
    </div>
  );
}
