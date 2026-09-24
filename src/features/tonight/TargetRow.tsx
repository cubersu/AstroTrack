import { Link } from '../../app/router';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import type { ScanItem } from '../../workers/serviceTypes';
import { ClassBadge, ConfidenceBadge, reasonText, ScoreRing } from '../common/ScoreViews';
import { classifyScore } from '../../astro/config';
import { useApp } from '../../app/AppState';

export function TargetRow({ item, dateParam }: { item: ScanItem; dateParam?: string }) {
  const i18n = useI18n();
  const { t, fmtTime, fmtDuration, fmtNumber } = i18n;
  const app = useApp();
  const s = item.summary;
  const weatherIncluded =
    item.tonight.weatherStatus === 'included' || item.tonight.weatherStatus === 'hard-stop';
  const score = item.tonight.score;
  const cls = classifyScore(score, app.settings.scoring.classThresholds);
  const top = item.reasons.filter((r) => r.polarity === 'positive').slice(0, 2);
  const neg = item.reasons.filter((r) => r.polarity === 'negative').slice(0, 2);
  return (
    <Link
      to={`/target/${encodeURIComponent(s.id)}${dateParam ? `?date=${dateParam}` : ''}`}
      className="list-item"
      aria-label={`${s.name}${s.commonName ? ' — ' + s.commonName : ''}: ${t('tonight.tonightScore')} ${score}`}
    >
      <ScoreRing score={score} cls={cls} label={t('tonight.tonightScore')} />
      <div className="body">
        <div className="title">
          {s.name}
          {s.commonName && <span className="muted"> · {s.commonName}</span>}
        </div>
        <div className="sub">
          {t(`types.${s.type}` as TKey)}
          {item.focalLengthMm && (
            <> · {t('tonight.focal', { focal: Math.round(item.focalLengthMm) })}</>
          )}
          {item.window && (
            <>
              {' '}
              ·{' '}
              {t('tonight.window', {
                start: fmtTime(item.window.startMs),
                end: fmtTime(item.window.endMs),
              })}
            </>
          )}
          {' · '}
          {t('tonight.maxAlt', { alt: fmtNumber(item.maxAltDeg, 0) })}
          {item.recommendedH != null && (
            <> · {t('tonight.recommendedIntegration', { hours: fmtDuration(item.recommendedH) })}</>
          )}
        </div>
        <div className="row" style={{ marginTop: 4, gap: '0.35rem' }}>
          <ClassBadge cls={cls} />
          <span className="badge neutral">
            {t('tonight.astroScore')} {item.astroScore}
          </span>
          {!weatherIncluded && <span className="badge neutral">{t('tonight.weatherOff')}</span>}
          {item.tonight.weatherStatus === 'hard-stop' && (
            <span className="badge bad">⚠ {t('weather.hardStop')}</span>
          )}
          <ConfidenceBadge level={item.confidence} />
        </div>
        <div className="tiny" style={{ marginTop: 4 }}>
          {top.map((r) => (
            <div key={r.code} style={{ color: 'var(--good)' }}>
              ＋ {reasonText(i18n, r)}
            </div>
          ))}
          {neg.map((r) => (
            <div key={r.code} style={{ color: 'var(--bad)' }}>
              － {reasonText(i18n, r)}
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
