import type { AstroComponent, ConfidenceLevel, ScoreClass } from '../../astro/config';
import { ASTRO_WEIGHTS } from '../../astro/config';
import type { Reason } from '../../astro/explain';
import { useI18n } from '../../i18n/i18n';
import type { I18n, TKey } from '../../i18n/i18n';

export function ScoreRing({
  score,
  cls,
  label,
}: {
  score: number;
  cls: ScoreClass;
  label: string;
}) {
  return (
    <span className={`score ${cls}`} role="img" aria-label={`${label}: ${score}`}>
      {score}
      <small aria-hidden="true">/100</small>
    </span>
  );
}

export function ClassBadge({ cls }: { cls: ScoreClass }) {
  const { t } = useI18n();
  return <span className={`badge ${cls}`}>{t(`scoreClass.${cls}` as TKey)}</span>;
}

export function ConfidenceBadge({
  level,
  factors,
}: {
  level: ConfidenceLevel;
  factors?: string[];
}) {
  const { t, td } = useI18n();
  const cls = level === 'high' ? 'good' : level === 'medium' ? 'warn' : 'bad';
  const title = factors?.length ? factors.map((f) => td(`confidence.${f}`)).join('\n') : undefined;
  return (
    <span className={`badge ${cls}`} title={title}>
      {t('confidence.label')}: {t(`confidence.${level}` as TKey)}
    </span>
  );
}

/** Translate a reason, translating nested enum params (filter kinds, sky sources). */
export function reasonText(i18n: I18n, r: Reason): string {
  const params: Record<string, string | number> = { ...(r.params ?? {}) };
  if (typeof params.filter === 'string') params.filter = i18n.td(`filterKind.${params.filter}`);
  if (typeof params.source === 'string') params.source = i18n.td(`skySource.${params.source}`);
  for (const k of [
    'sep',
    'alt',
    'meanAlt',
    'maxAlt',
    'pct',
    'illum',
    'px',
    'focal',
    'bortle',
    'minAlt',
  ] as const) {
    if (typeof params[k] === 'number') params[k] = i18n.fmtNumber(params[k] as number, 0);
  }
  for (const k of ['delta', 'hours', 'sb', 'sqm', 'airmass', 'sec', 'fill', 'mag'] as const) {
    if (typeof params[k] === 'number') params[k] = i18n.fmtNumber(params[k] as number, 1);
  }
  return i18n.td(`reasons.${r.code}`, params);
}

export function ReasonList({ reasons, limit }: { reasons: Reason[]; limit?: number }) {
  const i18n = useI18n();
  const list = limit ? reasons.slice(0, limit) : reasons;
  return (
    <ul className="reasons">
      {list.map((r, i) => (
        <li key={r.code + i}>
          <span
            className={
              r.polarity === 'positive' ? 'pos' : r.polarity === 'negative' ? 'neg' : 'inf'
            }
            aria-hidden="true"
          >
            {r.polarity === 'positive' ? '＋' : r.polarity === 'negative' ? '－' : '•'}
          </span>
          <span>
            <span className="visually-hidden">
              {r.polarity === 'positive'
                ? i18n.t('target.positives')
                : r.polarity === 'negative'
                  ? i18n.t('target.negatives')
                  : ''}
              :{' '}
            </span>
            {reasonText(i18n, r)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ComponentBreakdown({
  components,
}: {
  components: Record<AstroComponent, { score: number; weight: number }>;
}) {
  const { t, fmtNumber } = useI18n();
  return (
    <div className="stack">
      {(Object.keys(ASTRO_WEIGHTS) as AstroComponent[]).map((k) => {
        const c = components[k];
        return (
          <div key={k}>
            <div className="row between small">
              <span>
                {t(`components.${k}` as TKey)}{' '}
                <span className="faint tiny">
                  ({t('components.weight', { pct: Math.round(c.weight * 100) })})
                </span>
              </span>
              <span className="mono">{fmtNumber(c.score, 0)}</span>
            </div>
            <div className="bar" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
