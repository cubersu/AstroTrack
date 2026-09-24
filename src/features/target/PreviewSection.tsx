import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import type { DsoSummary } from '../../catalog/types';
import type { PreviewCacheRecord } from '../../data/dataDb';
import { fetchPreview, getCachedPreview, previewFovDeg } from '../../data/previews';
import { useI18n } from '../../i18n/i18n';
import { useOnline } from '../../ui/hooks';
import { FramingSimulator } from './FramingSimulator';

export function PreviewSection({ summary }: { summary: DsoSummary }) {
  const { t, fmtDate } = useI18n();
  const app = useApp();
  const online = useOnline();
  const [rec, setRec] = useState<PreviewCacheRecord | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [err, setErr] = useState('');
  const fov = previewFovDeg(summary.majorArcmin);

  useEffect(() => {
    let alive = true;
    getCachedPreview(summary.id).then((r) => alive && setRec(r ?? null));
    return () => {
      alive = false;
    };
  }, [summary.id]);
  useEffect(() => {
    if (!rec) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(rec.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [rec]);

  const load = async () => {
    setState('loading');
    try {
      setRec(await fetchPreview(summary.id, summary.raDeg, summary.decDeg, fov));
      setState('idle');
    } catch (e) {
      setErr((e as Error).message);
      setState('error');
    }
  };

  return (
    <section className="card" aria-labelledby="preview-h">
      <h2 id="preview-h">{t('preview.title')}</h2>
      {url && rec ? (
        <figure style={{ margin: 0 }}>
          <img className="preview-img" src={url} alt={`${summary.name} — ${t('preview.source')}`} />
          <figcaption className="tiny muted" style={{ marginTop: 4 }}>
            {t('preview.source')} · {rec.fovDeg.toFixed(2)}° ·{' '}
            {t('preview.cached', { date: fmtDate(rec.fetchedAt) })}
            <br />
            {rec.attribution}
          </figcaption>
        </figure>
      ) : (
        <>
          {rec === null && (
            <div style={{ maxWidth: 420 }}>
              <FramingSimulator
                raDeg={summary.raDeg}
                decDeg={summary.decDeg}
                fovWidthDeg={fov * 0.6}
                fovHeightDeg={fov * 0.4}
                rotationDeg={90}
                majorArcmin={summary.majorArcmin}
                minorArcmin={summary.minorArcmin}
                targetPaDeg={summary.positionAngleDeg}
                targetLabel={summary.name}
                showSensor={false}
              />
              <p className="tiny muted">{t('preview.offlineFallback')}</p>
            </div>
          )}
          {app.settings.previewsEnabled ? (
            online && (
              <button
                type="button"
                className="btn"
                onClick={() => void load()}
                disabled={state === 'loading'}
              >
                {state === 'loading' ? t('preview.fetching') : t('preview.fetch')}
              </button>
            )
          ) : (
            <p className="small muted">{t('preview.disabled')}</p>
          )}
          {state === 'error' && (
            <p className="small" style={{ color: 'var(--warn)' }}>
              {t('preview.failed', { error: err })}
            </p>
          )}
        </>
      )}
      <p className="tiny faint">{t('preview.note')}</p>
    </section>
  );
}
