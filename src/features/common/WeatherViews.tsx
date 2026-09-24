import type { HourlyWeatherScore, SessionWeather } from '../../astro/weatherScore';
import { useApp } from '../../app/AppState';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Icon } from '../../ui/Icon';

export function WeatherConsent() {
  const { t } = useI18n();
  const app = useApp();
  if (app.settings.weatherEnabled !== null) return null;
  return (
    <section className="card notice">
      <h2 className="row">
        <Icon name="cloud" /> {t('weather.askTitle')}
      </h2>
      <p className="small">{t('weather.askBody')}</p>
      <div className="row">
        <button
          className="btn primary"
          type="button"
          onClick={() => void app.update({ weatherEnabled: true })}
        >
          {t('weather.enable')}
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => void app.update({ weatherEnabled: false })}
        >
          {t('weather.notNow')}
        </button>
      </div>
    </section>
  );
}

/** One-line status of the weather subsystem. */
export function WeatherStatusLine() {
  const { t, fmtDateTime } = useI18n();
  const { settings, weather } = useApp();
  if (settings.weatherEnabled !== true) {
    return settings.weatherEnabled === false ? (
      <p className="small muted">{t('weather.disabled')}</p>
    ) : null;
  }
  if (weather.loading && !weather.result)
    return <p className="small muted">{t('weather.loading')}</p>;
  const r = weather.result;
  if (!r || r.status === 'unavailable')
    return (
      <p className="small" style={{ color: 'var(--warn)' }}>
        {t('weather.unavailable')}{' '}
        <button className="btn small ghost" type="button" onClick={() => weather.refresh(true)}>
          {t('common.retry')}
        </button>
      </p>
    );
  const when = r.forecast ? fmtDateTime(r.forecast.fetchedAt) : '';
  return (
    <p className="small muted row">
      <Icon name="cloud" />
      {r.status === 'offline-cached'
        ? t('weather.offlineCached', { time: when })
        : t('weather.fresh', { time: when })}
      <span className="faint tiny">{t('weather.source')}</span>
      <button
        className="btn small ghost"
        type="button"
        onClick={() => weather.refresh(true)}
        aria-label={t('weather.refresh')}
      >
        <Icon name="refresh" />
      </button>
    </p>
  );
}

export function weatherBadgeClass(score: number): string {
  if (score >= 85) return 'good';
  if (score >= 70) return 'ok';
  if (score >= 50) return 'warn';
  return 'bad';
}

export function SessionWeatherView({ session }: { session: SessionWeather }) {
  const { t, fmtTime, fmtNumber } = useI18n();
  return (
    <div className="stack">
      {session.hardStop ? (
        <p style={{ color: 'var(--bad)', fontWeight: 600 }}>
          {t('weather.hardStop')} ({t(`weather.hardStopReason.${session.hardStop}` as TKey)})
        </p>
      ) : (
        <div className="row">
          <span className={`badge ${weatherBadgeClass(session.score)}`}>
            {t('weather.session')}: {fmtNumber(session.score, 0)} —{' '}
            {t(`weather.label.${session.label}` as TKey)}
          </span>
          <span className="tiny faint">{t('weather.sessionHint')}</span>
        </div>
      )}
      {session.humidity !== 'none' && (
        <p className="small" style={{ color: 'var(--warn)' }}>
          {session.humidity === 'strong'
            ? t('weather.humidityStrong')
            : t('weather.humidityWarning')}
        </p>
      )}
      {session.dewRiskFromMs && (
        <p className="small" style={{ color: 'var(--warn)' }}>
          {t('weather.dewRiskFrom', { time: fmtTime(session.dewRiskFromMs) })}
        </p>
      )}
      <HourlyTable hours={session.hours} />
    </div>
  );
}

export function HourlyTable({ hours }: { hours: HourlyWeatherScore[] }) {
  const { t, fmtTime, fmtNumber } = useI18n();
  if (hours.length === 0) return null;
  return (
    <div className="table-wrap">
      <table className="data">
        <caption className="visually-hidden">{t('weather.hourly')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('weather.time')}</th>
            <th scope="col">{t('weather.score')}</th>
            <th scope="col">{t('weather.effectiveCloud')}</th>
            <th scope="col">{t('weather.dewSpread')}</th>
            <th scope="col">{t('weather.wind')}</th>
            <th scope="col" title={t('weather.clarityNote')}>
              {t('weather.clarity')}
            </th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h.timeMs}>
              <td>{fmtTime(h.timeMs)}</td>
              <td>
                <span className={`badge ${h.hardStop ? 'bad' : weatherBadgeClass(h.score)}`}>
                  {h.hardStop ? '⚠' : fmtNumber(h.score, 0)}
                </span>
              </td>
              <td>{h.ceff != null ? `${fmtNumber(h.ceff, 0)}%` : '—'}</td>
              <td>{h.dewSpreadC != null ? `${fmtNumber(h.dewSpreadC, 1)} °C` : '—'}</td>
              <td>{h.windEff != null ? `${fmtNumber(h.windEff, 0)} km/h` : '—'}</td>
              <td>{h.components.clarity != null ? fmtNumber(h.components.clarity, 0) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="tiny faint">{t('weather.clarityNote')}</p>
    </div>
  );
}
