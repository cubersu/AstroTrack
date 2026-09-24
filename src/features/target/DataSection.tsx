import { resolveSurfaceBrightness } from '../../astro/surfaceBrightness';
import { formatDec, formatRa } from '../../astro/units';
import { constellationName, constellationIndex } from '../../catalog/constellations';
import type { DsoDetail, DsoSummary } from '../../catalog/types';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';

export function DataSection({
  summary: s,
  detail,
}: {
  summary: DsoSummary;
  detail: DsoDetail | null;
}) {
  const { t, fmtNumber } = useI18n();
  const sb = resolveSurfaceBrightness({
    type: s.type,
    magV: s.magV,
    magB: s.magB,
    majorArcmin: s.majorArcmin,
    minorArcmin: s.minorArcmin,
    sbCatalogue: s.sbCatalogue,
    sbBand: s.sbBand,
  });
  const basis =
    sb.basis === 'catalogue'
      ? t('common.catalogue')
      : sb.basis === 'derived'
        ? t('common.estimated')
        : t('common.assumed');
  return (
    <>
      <section className="card" aria-labelledby="coord-h">
        <h2 id="coord-h">{t('target.coordinates')}</h2>
        <dl className="kv mono small">
          <dt>
            {t('target.ra')} ({t('target.j2000')})
          </dt>
          <dd>{formatRa(s.raDeg)}</dd>
          <dt>
            {t('target.dec')} ({t('target.j2000')})
          </dt>
          <dd>{formatDec(s.decDeg)}</dd>
          <dt>{t('target.constellation')}</dt>
          <dd>
            {s.constellation
              ? `${constellationName(constellationIndex(s.constellation))} (${s.constellation})`
              : '—'}
          </dd>
        </dl>
      </section>
      <section className="card" aria-labelledby="data-h">
        <h2 id="data-h">{t('target.data')}</h2>
        <dl className="kv">
          <dt>{t('target.type')}</dt>
          <dd>{t(`types.${s.type}` as TKey)}</dd>
          <dt>{t('target.size')}</dt>
          <dd>
            {s.majorArcmin != null
              ? `${fmtNumber(s.majorArcmin, 1)}′${s.minorArcmin != null ? ` × ${fmtNumber(s.minorArcmin, 1)}′` : ''}`
              : t('common.unknown')}
          </dd>
          {s.positionAngleDeg != null && (
            <>
              <dt>{t('target.positionAngle')}</dt>
              <dd>{fmtNumber(s.positionAngleDeg, 0)}°</dd>
            </>
          )}
          <dt>{t('target.magnitude')}</dt>
          <dd>
            {s.magV != null ? `V ${fmtNumber(s.magV, 2)}` : ''}
            {s.magV != null && s.magB != null ? ' · ' : ''}
            {s.magB != null ? `B ${fmtNumber(s.magB, 2)}` : ''}
            {s.magV == null && s.magB == null ? t('common.unknown') : ''}
          </dd>
          <dt>{t('target.surfaceBrightness')}</dt>
          <dd>
            {fmtNumber(sb.sbV, 1)} {t('units.magArcsec2')} (V, {basis})
            {s.sbCatalogue != null && (
              <span className="tiny muted">
                {' '}
                · {t('common.catalogue')}: {s.sbBand} {fmtNumber(s.sbCatalogue, 2)}
              </span>
            )}
          </dd>
          {detail?.hubble && (
            <>
              <dt>{t('target.hubble')}</dt>
              <dd>{detail.hubble}</dd>
            </>
          )}
          {detail?.redshift != null && (
            <>
              <dt>{t('target.redshift')}</dt>
              <dd>{detail.redshift}</dd>
            </>
          )}
          {detail?.radialVelocityKms != null && (
            <>
              <dt>{t('target.radialVelocity')}</dt>
              <dd>{detail.radialVelocityKms} km/s</dd>
            </>
          )}
          {detail && detail.commonNames.length > 0 && (
            <>
              <dt>{t('target.commonNames')}</dt>
              <dd>{detail.commonNames.join(', ')}</dd>
            </>
          )}
          {detail && detail.aliases.length > 0 && (
            <>
              <dt>{t('target.aliases')}</dt>
              <dd>{detail.aliases.join(', ')}</dd>
            </>
          )}
          <dt>{t('target.catalogue')}</dt>
          <dd>{detail?.catalogue ?? 'OpenNGC'} (CC BY-SA 4.0)</dd>
        </dl>
        {(detail?.nedNotes || detail?.ongcNotes) && (
          <details style={{ marginTop: '0.5rem' }}>
            <summary className="small">{t('target.notes')}</summary>
            {detail.ongcNotes && <p className="small">{detail.ongcNotes}</p>}
            {detail.nedNotes && <p className="small">{detail.nedNotes}</p>}
          </details>
        )}
        {detail?.sources && (
          <details style={{ marginTop: '0.5rem' }}>
            <summary className="small">{t('target.provenance')}</summary>
            <p className="tiny mono">{detail.sources}</p>
          </details>
        )}
      </section>
    </>
  );
}
