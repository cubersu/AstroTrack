import { useState } from 'react';
import { useApp } from '../../app/AppState';
import { Link, navigate } from '../../app/router';
import { formatCalendarDate } from '../../astro/time';
import { userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Spinner } from '../../ui/controls';
import { useLiveQuery } from '../../ui/hooks';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toast';
import { usePlanningDate } from '../common/nightHooks';
import { PlanningControls } from '../common/PlanningControls';
import { SetupPrompt } from '../common/SetupPrompt';
import { WeatherStatusLine } from '../common/WeatherViews';
import { DataSection } from './DataSection';
import { FramingSection } from './FramingSection';
import { PlanDialog } from './PlanDialog';
import { PreviewSection } from './PreviewSection';
import { RecipeSection, lightsFor } from './RecipeSection';
import { ScoreSection } from './ScoreSection';
import { useEvaluation, useTargetDetail } from './useEvaluation';
import { VisibilitySection } from './VisibilitySection';

export function TargetPage({ id }: { id: string }) {
  const { t } = useI18n();
  const app = useApp();
  const toast = useToast();
  const [date, setDate] = usePlanningDate(app.location);
  const detail = useTargetDetail(id);
  const { ev, error } = useEvaluation(id, date);
  const fav = useLiveQuery(() => userDb().favorites.get(id), [id], undefined);
  const [planOpen, setPlanOpen] = useState(false);

  if (!app.catalogue.ready || detail === undefined)
    return <Spinner label={t('app.loadingCatalogue')} />;
  if (detail === null)
    return (
      <div className="card">
        <p>{t('target.notFound')}</p>
        <Link to="/explore">{t('nav.explore')}</Link>
      </div>
    );
  const s = detail.summary;

  const startSession = async () => {
    const e = ev?.evaluation;
    const sub = e?.sub?.recommendedS ?? 60;
    await userDb().session.put({
      id: 'active',
      startedAt: Date.now(),
      targetId: s.id,
      targetName: s.name + (s.commonName ? ` (${s.commonName})` : ''),
      planId: null,
      locationId: app.location?.id ?? null,
      rigId: app.rig?.id ?? null,
      opticsId: e?.optics?.opticsId ?? null,
      focalLengthMm: e?.optics?.focalLengthMm ?? null,
      fNumber: e?.optics?.fNumber ?? null,
      subExposureS: sub,
      plannedLights: e?.integration ? lightsFor(e.integration.recommendedH, sub) : 60,
      completedLights: 0,
      isoGain: '',
      notes: '',
    });
    toast(t('session.started'));
    navigate('/session');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => history.back()}
            aria-label={t('common.back')}
          >
            <Icon name="back" />
          </button>
          <h1 style={{ display: 'inline' }}>
            {s.name}
            {s.commonName && <span className="muted"> · {s.commonName}</span>}
          </h1>
          <div className="small muted">
            {t(`types.${s.type}` as TKey)}
            {s.constellation && ` · ${s.constellation}`}
          </div>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn"
            aria-pressed={!!fav}
            onClick={async () => {
              if (fav) await userDb().favorites.delete(id);
              else await userDb().favorites.put({ objectId: id, addedAt: Date.now(), note: '' });
            }}
          >
            <Icon name={fav ? 'heartFill' : 'heart'} filled={!!fav} />{' '}
            {fav ? t('target.unfavorite') : t('target.favorite')}
          </button>
          {date && (
            <button type="button" className="btn" onClick={() => setPlanOpen(true)}>
              <Icon name="calendar" /> {t('target.createPlan')}
            </button>
          )}
          <button type="button" className="btn" onClick={() => void startSession()}>
            <Icon name="play" /> {t('target.startSession')}
          </button>
          <Link className="btn" to={`/journal?new=1&target=${encodeURIComponent(s.id)}`}>
            <Icon name="book" /> {t('target.addJournal')}
          </Link>
        </div>
      </div>
      <SetupPrompt />
      <section className="card">
        <PlanningControls date={date} onDate={setDate} />
        <div style={{ marginTop: '0.5rem' }}>
          <WeatherStatusLine />
        </div>
      </section>
      {error && <p style={{ color: 'var(--bad)' }}>{t('common.error', { error })}</p>}
      {ev && <ScoreSection ev={ev} />}
      <VisibilitySection ev={ev} summary={s} />
      <FramingSection ev={ev} summary={s} />
      {ev && app.rigInput ? <RecipeSection ev={ev} summary={s} /> : null}
      <PreviewSection summary={s} />
      <DataSection summary={s} detail={detail.detail} />
      {planOpen && date && (
        <PlanDialog summary={s} ev={ev} date={date} onClose={() => setPlanOpen(false)} />
      )}
      <p className="tiny faint">{date && formatCalendarDate(date)}</p>
    </div>
  );
}
