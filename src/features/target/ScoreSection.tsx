import type { EvaluateResponse } from '../../workers/serviceTypes';
import { useI18n } from '../../i18n/i18n';
import { negatives, positives } from '../../astro/explain';
import {
  ClassBadge,
  ComponentBreakdown,
  ConfidenceBadge,
  ReasonList,
  ScoreRing,
} from '../common/ScoreViews';
import { SessionWeatherView } from '../common/WeatherViews';
import { useApp } from '../../app/AppState';

export function ScoreSection({ ev }: { ev: EvaluateResponse }) {
  const { t, td, fmtNumber } = useI18n();
  const app = useApp();
  const e = ev.evaluation;
  const tn = ev.tonight;
  const hard = e.reasons.filter((r) => r.component === 'hard');
  return (
    <section className="card" aria-labelledby="score-h">
      <h2 id="score-h">{t('target.score')}</h2>
      <p className="tiny muted">
        {t('target.scoreFor', { rig: app.rig?.name ?? '—', location: app.location?.name ?? '—' })}
      </p>
      <div className="row" style={{ gap: '1.25rem', alignItems: 'center' }}>
        <div className="stack" style={{ alignItems: 'center' }}>
          <ScoreRing score={e.score} cls={e.scoreClass} label={t('tonight.astroScore')} />
          <span className="tiny">{t('tonight.astroScore')}</span>
        </div>
        <div className="stack" style={{ alignItems: 'center' }}>
          <ScoreRing score={tn.score} cls={tn.scoreClass} label={t('tonight.tonightScore')} />
          <span className="tiny">{t('tonight.tonightScore')}</span>
        </div>
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          <ClassBadge cls={e.scoreClass} />
          <ConfidenceBadge level={e.confidence.level} factors={e.confidence.factors} />
          <span className="tiny muted">
            {tn.weatherStatus === 'included'
              ? t('weather.multiplier', { value: fmtNumber(tn.weatherMultiplier, 2) })
              : tn.weatherStatus === 'beyond-forecast'
                ? t('weather.beyondForecast')
                : tn.weatherStatus === 'hard-stop'
                  ? t('weather.hardStop')
                  : t('weather.notIncluded')}
            {' · ×'}
            {fmtNumber(tn.timeMultiplier, 2)} ({t('controls.availability').toLowerCase()})
          </span>
        </div>
      </div>
      {tn.weatherStatus === 'hard-stop' && (
        <p style={{ color: 'var(--bad)', fontWeight: 600, marginTop: '0.5rem' }}>
          {t('weather.hardStop')}
        </p>
      )}
      {hard.length > 0 && (
        <div className="card danger tight" style={{ marginTop: '0.75rem' }}>
          <strong>
            {e.insufficientData && !e.hardConstraints.length
              ? t('target.insufficientData')
              : t('target.hardConstraint')}
          </strong>
          <ReasonList reasons={hard} />
        </div>
      )}
      <h3 style={{ marginTop: '0.75rem' }}>{t('target.explanation')}</h3>
      <div className="grid two">
        <div>
          <h4 className="small" style={{ color: 'var(--good)' }}>
            {t('target.positives')}
          </h4>
          <ReasonList reasons={positives(e.reasons)} />
        </div>
        <div>
          <h4 className="small" style={{ color: 'var(--bad)' }}>
            {t('target.negatives')}
          </h4>
          <ReasonList reasons={negatives(e.reasons).filter((r) => r.component !== 'hard')} />
        </div>
      </div>
      <details style={{ marginTop: '0.75rem' }}>
        <summary>{t('target.advancedDetails')}</summary>
        <div style={{ marginTop: '0.5rem' }}>
          <h4 className="small">{t('target.breakdown')}</h4>
          <ComponentBreakdown components={e.components} />
          <ReasonList reasons={e.reasons.filter((r) => r.polarity === 'info')} />
          {e.confidence.factors.length > 0 && (
            <>
              <h4 className="small" style={{ marginTop: '0.5rem' }}>
                {t('confidence.factors')}
              </h4>
              <ul className="small">
                {e.confidence.factors.map((f) => (
                  <li key={f}>{td(`confidence.${f}`)}</li>
                ))}
              </ul>
            </>
          )}
          <p className="tiny faint">{t('tonight.tonightHint')}</p>
        </div>
      </details>
      {tn.session && (
        <div style={{ marginTop: '0.75rem' }}>
          <h3>{t('target.weather')}</h3>
          <SessionWeatherView session={tn.session} />
        </div>
      )}
      {!tn.session && tn.weatherStatus !== 'disabled' && (
        <p className="small muted" style={{ marginTop: '0.5rem' }}>
          {tn.weatherStatus === 'beyond-forecast'
            ? t('weather.beyondForecast')
            : t('weather.unavailable')}
        </p>
      )}
    </section>
  );
}
