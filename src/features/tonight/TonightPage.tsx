import { useEffect, useMemo, useState } from 'react';
import {
  geo,
  availableHoursFromSettings,
  useNightSummary,
  usePlanningDate,
} from '../common/nightHooks';
import { useApp } from '../../app/AppState';
import { catalogWithProgress } from '../../app/catalogClient';
import { nightDateForInstant, formatCalendarDate } from '../../astro/time';
import type { CatalogueGroup } from '../../catalog/catalogStore';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Checkbox, EmptyState, Spinner } from '../../ui/controls';
import { useNow } from '../../ui/hooks';
import type { ScanResponse } from '../../workers/serviceTypes';
import { NightCard } from '../common/NightCard';
import { PlanningControls } from '../common/PlanningControls';
import { SetupPrompt } from '../common/SetupPrompt';
import { CATEGORY_KEYS, typesForCategories } from '../common/typeCategories';
import type { TypeCategory } from '../common/typeCategories';
import { WeatherConsent, WeatherStatusLine } from '../common/WeatherViews';
import { TargetRow } from './TargetRow';
import { SpecialTonight } from '../events/SpecialTonight';

export function TonightPage({ mode }: { mode: 'tonight' | 'now' }) {
  const { t } = useI18n();
  const app = useApp();
  const now = useNow(mode === 'now' ? 60_000 : 10 * 60_000);
  const [planDate, setPlanDate] = usePlanningDate(app.location);
  const date = useMemo(
    () =>
      mode === 'now' && app.location ? nightDateForInstant(now, app.location.lonDeg) : planDate,
    [mode, now, app.location, planDate],
  );
  const summary = useNightSummary(app.location, date);
  const [group, setGroup] = useState<CatalogueGroup>('all');
  const [cats, setCats] = useState<TypeCategory[]>([]);
  const [includeUnsuitable, setIncludeUnsuitable] = useState(false);
  const [sortBy, setSortBy] = useState<'tonight' | 'astro'>('tonight');
  const [limit, setLimit] = useState(50);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = app.catalogue.ready && app.location && app.rigInput && date;
  const nowKey = mode === 'now' ? Math.floor(now / 300_000) : 0; // re-scan every 5 min in Now mode
  useEffect(() => {
    if (!ready || !app.location || !app.rigInput || !date) return;
    let alive = true;
    setProgress(0);
    setError(null);
    const call = catalogWithProgress();
    call(
      'scan',
      [
        {
          location: geo(app.location),
          date,
          rig: app.rigInput,
          sky: app.sky,
          settings: app.settings.scoring,
          exposureMode: app.settings.exposureMode,
          timeMode: mode,
          nowMs: mode === 'now' ? Date.now() : undefined,
          availableHours: availableHoursFromSettings(app.settings),
          weather: app.weather.input,
          weatherEnabled: app.settings.weatherEnabled === true,
          filter: { group, types: typesForCategories(cats) },
          limit: 300,
          includeUnsuitable,
          sortBy,
        },
      ],
      (p) => alive && setProgress(p),
    ).then(
      (r) => {
        if (!alive) return;
        setResult(r);
        setProgress(null);
      },
      (e: Error) => {
        if (!alive) return;
        setError(e.message);
        setProgress(null);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    app.location,
    app.rigInput,
    app.sky,
    app.settings.scoring,
    app.settings.exposureMode,
    app.settings.availability,
    app.settings.customAvailabilityMin,
    app.weather.input,
    app.settings.weatherEnabled,
    date?.year,
    date?.month,
    date?.day,
    mode,
    nowKey,
    group,
    cats,
    includeUnsuitable,
    sortBy,
  ]);

  const dateParam = date ? formatCalendarDate(date) : undefined;
  const night = summary?.night;
  const notDarkYet = mode === 'now' && night?.darkStartMs && now < night.darkStartMs;
  const over = mode === 'now' && night && now > (night.darkEndMs ?? night.spanEndMs);

  return (
    <div>
      <div className="page-header">
        <h1>{mode === 'now' ? t('tonight.nowTitle') : t('tonight.title')}</h1>
        <p>{mode === 'now' ? t('tonight.nowSubtitle') : t('tonight.subtitle')}</p>
      </div>
      <SetupPrompt />
      <WeatherConsent />
      <section className="card">
        <PlanningControls date={date} onDate={setPlanDate} showDate={mode === 'tonight'} />
        <div style={{ marginTop: '0.5rem' }}>
          <WeatherStatusLine />
        </div>
      </section>
      {summary && <NightCard data={summary} />}
      {app.location && date && <SpecialTonight location={app.location} date={date} />}
      {notDarkYet && <p className="small muted">{t('tonight.notDarkNow')}</p>}
      {over && (
        <p className="small" style={{ color: 'var(--warn)' }}>
          {t('tonight.nightOver')}
        </p>
      )}
      <section className="card">
        <div className="row" style={{ marginBottom: '0.5rem' }}>
          <select
            aria-label={t('controls.group')}
            value={group}
            onChange={(e) => setGroup(e.target.value as CatalogueGroup)}
            style={{ width: 'auto' }}
          >
            <option value="all">{t('controls.groupAll')}</option>
            <option value="messier">{t('controls.groupMessier')}</option>
            <option value="caldwell">{t('controls.groupCaldwell')}</option>
            <option value="named">{t('controls.groupNamed')}</option>
          </select>
          {CATEGORY_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={cats.includes(c)}
              onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}
            >
              {t(`controls.categories.${c}` as TKey)}
            </button>
          ))}
          <select
            aria-label={t('controls.sortBy')}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'tonight' | 'astro')}
            style={{ width: 'auto' }}
          >
            <option value="tonight">{t('controls.sortTonight')}</option>
            <option value="astro">{t('controls.sortAstro')}</option>
          </select>
          <Checkbox checked={includeUnsuitable} onChange={setIncludeUnsuitable}>
            {t('controls.showUnsuitable')}
          </Checkbox>
        </div>
        <p className="tiny faint">{t('tonight.tonightHint')}</p>
        {!app.catalogue.ready && !app.catalogue.error && (
          <Spinner label={t('app.loadingCatalogue')} />
        )}
        {app.catalogue.error && (
          <p style={{ color: 'var(--bad)' }}>
            {t('app.catalogueError', { error: app.catalogue.error })}
          </p>
        )}
        {progress !== null && (
          <div className="stack" aria-live="polite">
            <Spinner label={t('tonight.scanning', { count: app.catalogue.info?.count ?? '' })} />
            <div className="bar">
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          </div>
        )}
        {error && <p style={{ color: 'var(--bad)' }}>{t('common.error', { error })}</p>}
        {result && progress === null && (
          <>
            <p className="tiny muted">
              {t('tonight.results', {
                shown: Math.min(limit, result.items.length),
                evaluated: result.evaluated,
              })}{' '}
              · {t('tonight.tookMs', { ms: result.tookMs })}
            </p>
            {result.items.length === 0 ? (
              <EmptyState>{t('tonight.empty')}</EmptyState>
            ) : (
              <div role="list">
                {result.items.slice(0, limit).map((it) => (
                  <div role="listitem" key={it.summary.id}>
                    <TargetRow item={it} dateParam={dateParam} />
                  </div>
                ))}
              </div>
            )}
            {result.items.length > limit && (
              <button
                type="button"
                className="btn"
                style={{ marginTop: '0.5rem' }}
                onClick={() => setLimit((l) => l + 50)}
              >
                {t('common.showMore')}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
