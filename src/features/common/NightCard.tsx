import { moonPhaseName } from '../../astro/ephemeris';
import { darkHours } from '../../astro/twilight';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import type { NightSummaryData } from './nightHooks';

export function NightCard({ data }: { data: NightSummaryData }) {
  const { t, fmtTime, fmtDuration } = useI18n();
  const n = data.night;
  const time = (ms: number | null) => (ms ? fmtTime(ms) : '—');
  const hours = darkHours(n);
  return (
    <section className="card" aria-label={t('night.title')}>
      <div className="stats">
        <div className="stat">
          <span className="l">{t('night.sunset')}</span>
          <span className="v">{time(n.sunsetMs)}</span>
        </div>
        <div className="stat">
          <span className="l">
            {n.darkness === 'astronomical' ? t('night.astroDusk') : t('night.nautDusk')}
          </span>
          <span className="v">{time(n.darkStartMs)}</span>
        </div>
        <div className="stat">
          <span className="l">
            {n.darkness === 'astronomical' ? t('night.astroDawn') : t('night.nautDawn')}
          </span>
          <span className="v">{time(n.darkEndMs)}</span>
        </div>
        <div className="stat">
          <span className="l">{t('night.darkHours')}</span>
          <span className="v">{hours > 0 ? fmtDuration(hours) : '—'}</span>
        </div>
        <div className="stat">
          <span className="l">{t('night.moon')}</span>
          <span className="v" style={{ fontSize: '1rem' }}>
            {t(`moonPhase.${moonPhaseName(data.moonPhaseLon)}` as TKey)}
          </span>
          <span className="l">
            {t('night.illumination', { pct: Math.round(data.moonIllumination * 100) })}
          </span>
        </div>
        <div className="stat">
          <span className="l">
            {t('night.moonrise')} / {t('night.moonset')}
          </span>
          <span className="v" style={{ fontSize: '1rem' }}>
            {time(data.moonriseMs)} / {time(data.moonsetMs)}
          </span>
        </div>
      </div>
      {n.darkness !== 'astronomical' && (
        <p className="small" style={{ color: 'var(--warn)', marginTop: '0.5rem' }}>
          {n.darkness === 'nautical' ? t('night.nauticalOnly') : t('night.noDark')}
        </p>
      )}
    </section>
  );
}
