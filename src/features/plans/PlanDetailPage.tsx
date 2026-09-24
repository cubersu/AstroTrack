import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogWithProgress } from '../../app/catalogClient';
import { Link, navigate } from '../../app/router';
import { classifyScore } from '../../astro/config';
import { parseCalendarDate, formatCalendarDate } from '../../astro/time';
import { userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import { Spinner } from '../../ui/controls';
import { useLiveQuery } from '../../ui/hooks';
import type { OpportunityResponse } from '../../workers/serviceTypes';
import { availableHoursFromSettings, geo } from '../common/nightHooks';
import { ScoreRing } from '../common/ScoreViews';
import { nightsToGoal, planAchievedSeconds, planGoalHours } from './planProgress';
import { catalogApi } from '../../app/catalogClient';

export function PlanDetailPage({ id }: { id: string }) {
  const { t, fmtDuration, fmtTime } = useI18n();
  const app = useApp();
  const plan = useLiveQuery(() => userDb().plans.get(id), [id], undefined);
  const journal = useLiveQuery(
    () => userDb().journal.where('planId').equals(id).toArray(),
    [id],
    [],
  );
  const [outlook, setOutlook] = useState<OpportunityResponse | null>(null);
  const [recH, setRecH] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!plan || !app.location || !app.rigInput || !app.catalogue.ready) return;
    let alive = true;
    const loc = app.locations.find((l) => l.id === plan.locationId) ?? app.location;
    const start = parseCalendarDate(plan.nights[0] ?? plan.startDate);
    setProgress(0);
    const call = catalogWithProgress();
    call(
      'opportunities',
      [
        {
          ids: [plan.targetId],
          startDate: start,
          days: Math.max(1, plan.nights.length),
          location: geo(loc),
          rig: app.rigInput,
          sky: app.sky,
          settings: app.settings.scoring,
          exposureMode: plan.exposureMode,
          availableHours: availableHoursFromSettings(app.settings),
          weather: app.weather.input,
          weatherEnabled: app.settings.weatherEnabled === true,
          stepMinutes: 15,
        },
      ],
      (p) => alive && setProgress(p),
    ).then((r) => {
      if (!alive) return;
      setOutlook(r);
      setProgress(null);
    });
    catalogApi()
      .evaluate({
        id: plan.targetId,
        date: start,
        location: geo(loc),
        rig: app.rigInput,
        sky: app.sky,
        settings: app.settings.scoring,
        exposureMode: plan.exposureMode,
        timeMode: 'tonight',
        availableHours: null,
        weather: null,
        weatherEnabled: false,
      })
      .then((r) => alive && setRecH(r?.evaluation.integration?.recommendedH ?? null));
    return () => {
      alive = false;
    };
  }, [
    plan,
    app.location,
    app.locations,
    app.rigInput,
    app.sky,
    app.settings,
    app.weather.input,
    app.catalogue.ready,
  ]);

  if (plan === undefined) return <Spinner label={t('common.loading')} />;
  if (!plan) return <p>{t('target.notFound')}</p>;
  const doneS = planAchievedSeconds(plan, journal);
  const goalH = planGoalHours(plan, recH);
  const nights = outlook?.targets[0]?.nights ?? [];
  const remainingH = goalH !== null ? Math.max(0, goalH - doneS / 3600) : null;
  const perNight = nights.map((n) =>
    n.weatherStatus === 'hard-stop' ? 0 : n.tonightScore >= 40 ? n.usableHours : 0,
  );
  const needed = remainingH !== null ? nightsToGoal(remainingH, perNight) : null;

  return (
    <div>
      <div className="page-header">
        <h1>{plan.name}</h1>
        <p>
          <Link to={`/target/${encodeURIComponent(plan.targetId)}?date=${plan.startDate}`}>
            {plan.targetName}
          </Link>{' '}
          · {plan.type === 'single' ? t('plans.single') : t('plans.multi')}
        </p>
      </div>
      <section className="card">
        <h2>{t('plans.progress')}</h2>
        <p>
          {goalH !== null
            ? t('plans.achieved', { done: fmtDuration(doneS / 3600), goal: fmtDuration(goalH) })
            : fmtDuration(doneS / 3600)}{' '}
          <span className="tiny muted">({t('plans.fromJournal')})</span>
        </p>
        {goalH !== null && (
          <div
            className="bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(100, (doneS / 3600 / goalH) * 100))}
          >
            <span style={{ width: `${Math.min(100, (doneS / 3600 / goalH) * 100)}%` }} />
          </div>
        )}
        {needed !== null && needed > 0 && (
          <p className="small">{t('plans.nightsNeeded', { count: needed })}</p>
        )}
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <Link
            className="btn"
            to={`/journal?new=1&target=${encodeURIComponent(plan.targetId)}&plan=${plan.id}`}
          >
            {t('target.addJournal')}
          </Link>
          {plan.status === 'active' && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void userDb().plans.update(plan.id, { status: 'done', updatedAt: Date.now() })
              }
            >
              {t('plans.markDone')}
            </button>
          )}
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (window.confirm(t('common.confirmDelete', { name: plan.name }))) {
                await userDb().plans.delete(plan.id);
                navigate('/plans');
              }
            }}
          >
            {t('plans.delete')}
          </button>
        </div>
      </section>
      <section className="card">
        <h2>{t('plans.schedule')}</h2>
        <p className="tiny faint">{t('plans.forecastNote')}</p>
        {progress !== null && <Spinner label={t('plans.scanning')} />}
        <ul className="list">
          {nights.map((n) => (
            <li key={formatCalendarDate(n.date)} className="list-item">
              <ScoreRing
                score={n.tonightScore}
                cls={classifyScore(n.tonightScore, app.settings.scoring.classThresholds)}
                label={t('tonight.tonightScore')}
              />
              <div className="body">
                <Link
                  to={`/target/${encodeURIComponent(plan.targetId)}?date=${formatCalendarDate(n.date)}`}
                  className="title"
                >
                  {formatCalendarDate(n.date)}
                </Link>
                <div className="sub">
                  {n.window
                    ? t('tonight.window', {
                        start: fmtTime(n.window.startMs),
                        end: fmtTime(n.window.endMs),
                      })
                    : '—'}{' '}
                  · {t('plans.usableHours', { hours: fmtDuration(n.usableHours) })} ·{' '}
                  {t('night.illumination', { pct: Math.round(n.moonIllumination * 100) })}
                </div>
                <div className="tiny muted">
                  {n.weatherStatus === 'included'
                    ? t('weather.title')
                    : n.weatherStatus === 'hard-stop'
                      ? t('weather.hardStop')
                      : n.weatherStatus === 'beyond-forecast'
                        ? `${t('weather.beyondForecast')} (${t('plans.astroOnly')})`
                        : t('plans.astroOnly')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {journal.length > 0 && (
        <section className="card">
          <h2>{t('plans.linkedJournal')}</h2>
          <ul className="small">
            {journal.map((j) => (
              <li key={j.id}>
                {j.date}: {j.lightCount ?? '—'} × {j.subExposureS ?? '—'} s
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
