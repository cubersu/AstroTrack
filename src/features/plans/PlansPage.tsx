import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogWithProgress } from '../../app/catalogClient';
import { Link } from '../../app/router';
import { classifyScore } from '../../astro/config';
import { formatCalendarDate } from '../../astro/time';
import { userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { EmptyState, Segmented, Spinner, Tabs } from '../../ui/controls';
import { useLiveQuery } from '../../ui/hooks';
import { Icon } from '../../ui/Icon';
import type { OpportunityResponse } from '../../workers/serviceTypes';
import type { CometOpportunity } from '../../workers/eventsService';
import { catalogApi } from '../../app/catalogClient';
import { availableHoursFromSettings, geo, usePlanningDate } from '../common/nightHooks';
import { ScoreRing } from '../common/ScoreViews';
import { planAchievedSeconds } from './planProgress';

function FavoritesTab() {
  const { t, fmtDate, fmtNumber } = useI18n();
  const app = useApp();
  const favorites = useLiveQuery(
    () => userDb().favorites.orderBy('addedAt').reverse().toArray(),
    [],
    [],
  );
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [res, setRes] = useState<OpportunityResponse | null>(null);
  const [comets, setComets] = useState<CometOpportunity[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [date] = usePlanningDate(app.location);
  const [names, setNames] = useState<Record<string, string>>({});

  const favKey = favorites.map((f) => f.objectId).join('|');
  useEffect(() => {
    if (!app.catalogue.ready || !favKey) return;
    let alive = true;
    void catalogApi()
      .summaries(favKey.split('|'))
      .then(
        (s) =>
          alive &&
          setNames(
            Object.fromEntries(
              s.map((x) => [x.id, x.name + (x.commonName ? ` · ${x.commonName}` : '')]),
            ),
          ),
      );
    return () => {
      alive = false;
    };
  }, [favKey, app.catalogue.ready]);

  const run = async () => {
    if (!app.location || !app.rigInput || !date) return;
    setProgress(0);
    const call = catalogWithProgress();
    const r = await call(
      'opportunities',
      [
        {
          ids: favorites.map((f) => f.objectId),
          startDate: date,
          days: Number(days),
          location: geo(app.location),
          rig: app.rigInput,
          sky: app.sky,
          settings: app.settings.scoring,
          exposureMode: app.settings.exposureMode,
          availableHours: availableHoursFromSettings(app.settings),
          weather: app.weather.input,
          weatherEnabled: app.settings.weatherEnabled === true,
          stepMinutes: Number(days) > 30 ? 30 : 20,
        },
      ],
      setProgress,
    );
    setRes(r);
    const c = await catalogApi().cometOpportunities(
      Date.now(),
      Number(days),
      geo(app.location),
      11,
    );
    setComets(c);
    setProgress(null);
  };

  return (
    <div>
      <section className="card">
        <h2>{t('plans.favorites')}</h2>
        {favorites.length === 0 ? (
          <EmptyState>{t('plans.noFavorites')}</EmptyState>
        ) : (
          <ul className="list">
            {favorites.map((f) => (
              <li key={f.objectId} className="list-item">
                <Link
                  to={`/target/${encodeURIComponent(f.objectId)}`}
                  className="body"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <div className="title">{names[f.objectId] ?? f.objectId}</div>
                </Link>
                <button
                  type="button"
                  className="btn small danger"
                  onClick={() => void userDb().favorites.delete(f.objectId)}
                  aria-label={t('plans.remove')}
                >
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2>{t('plans.scan')}</h2>
        <div className="row">
          <Segmented
            label={t('plans.scan')}
            value={days}
            onChange={setDays}
            options={(['7', '30', '90'] as const).map((d) => ({
              value: d,
              label: t('plans.scanDays', { count: d }),
            }))}
          />
          <button
            type="button"
            className="btn primary"
            onClick={() => void run()}
            disabled={progress !== null || favorites.length === 0 || !app.rigInput}
          >
            {t('plans.scanRun')}
          </button>
        </div>
        <p className="tiny faint">{t('plans.forecastNote')}</p>
        {progress !== null && (
          <div className="bar" aria-label={t('plans.scanning')}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {res && (
          <ul className="list">
            {res.targets.map((tg) => (
              <li key={tg.summary.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                {tg.best ? (
                  <ScoreRing
                    score={tg.best.tonightScore}
                    cls={classifyScore(tg.best.tonightScore, app.settings.scoring.classThresholds)}
                    label={t('tonight.tonightScore')}
                  />
                ) : (
                  <span className="score unsuitable">–</span>
                )}
                <div className="body">
                  <Link
                    to={`/target/${encodeURIComponent(tg.summary.id)}?date=${tg.best ? formatCalendarDate(tg.best.date) : ''}`}
                    className="title"
                  >
                    {tg.summary.name}
                    {tg.summary.commonName && (
                      <span className="muted"> · {tg.summary.commonName}</span>
                    )}
                  </Link>
                  <div className="sub">
                    {tg.best
                      ? t('plans.bestNight', {
                          date: formatCalendarDate(tg.best.date),
                          score: tg.best.tonightScore,
                        })
                      : t('plans.noGoodNight')}
                  </div>
                  <div className="row" style={{ gap: 2, marginTop: 4 }} aria-hidden="true">
                    {tg.nights.map((n) => (
                      <span
                        key={formatCalendarDate(n.date)}
                        title={`${formatCalendarDate(n.date)}: ${n.tonightScore}`}
                        style={{
                          width: Math.max(4, Math.floor(280 / tg.nights.length)),
                          height: 14,
                          borderRadius: 2,
                          background: `var(--${n.tonightScore >= 80 ? 'good' : n.tonightScore >= 60 ? 'ok' : n.tonightScore >= 40 ? 'warn' : 'bad'})`,
                          opacity: n.weatherStatus === 'included' ? 1 : 0.55,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {progress !== null && <Spinner label={t('plans.scanning')} />}
        {comets && comets.length > 0 && (
          <>
            <h3 style={{ marginTop: '0.75rem' }}>{t('events.comets')}</h3>
            <ul className="small">
              {comets.map((c) => (
                <li key={c.designation}>
                  {c.designation}: {fmtDate(c.bestDateMs)} · {t('events.mag')} ≈{' '}
                  {c.bestMagnitude !== null ? fmtNumber(c.bestMagnitude, 1) : '—'} · max{' '}
                  {fmtNumber(c.maxAltDeg, 0)}°
                </li>
              ))}
            </ul>
            <p className="tiny faint">{t('events.cometsMagNote')}</p>
          </>
        )}
      </section>
    </div>
  );
}

export function PlansPage() {
  const { t, fmtDuration } = useI18n();
  const [tab, setTab] = useState<'plans' | 'favorites'>('plans');
  const plans = useLiveQuery(() => userDb().plans.orderBy('startDate').reverse().toArray(), [], []);
  const journal = useLiveQuery(() => userDb().journal.toArray(), [], []);
  return (
    <div>
      <div className="page-header">
        <h1>{t('plans.title')}</h1>
        <p>{t('plans.subtitle')}</p>
      </div>
      <Tabs
        label={t('plans.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'plans', label: t('plans.tabPlans') },
          { value: 'favorites', label: t('plans.tabFavorites') },
        ]}
      />
      {tab === 'plans' ? (
        <section className="card">
          {plans.length === 0 ? (
            <EmptyState>{t('plans.none')}</EmptyState>
          ) : (
            <ul className="list">
              {plans.map((p) => (
                <li key={p.id}>
                  <Link to={`/plans/${p.id}`} className="list-item">
                    <div className="body">
                      <div className="title">{p.name}</div>
                      <div className="sub">
                        {p.type === 'single' ? t('plans.single') : t('plans.multi')} · {p.startDate}{' '}
                        · {p.targetName}
                      </div>
                      <div className="tiny muted">
                        {t('plans.progress')}: {fmtDuration(planAchievedSeconds(p, journal) / 3600)}
                        {p.goalMode === 'custom' && p.goalHours
                          ? ` / ${fmtDuration(p.goalHours)}`
                          : ''}
                      </div>
                    </div>
                    <span
                      className={`badge ${p.status === 'active' ? 'info' : p.status === 'done' ? 'good' : 'neutral'}`}
                    >
                      {t(`plans.status.${p.status}` as TKey)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <FavoritesTab />
      )}
    </div>
  );
}
