import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppState';
import { cameraPixelPitchUm, isZoom, opticsMultiplier } from '../../astro/equipment';
import { evaluateFraming } from '../../astro/framing';
import type { DsoSummary } from '../../catalog/types';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import type { EvaluateResponse } from '../../workers/serviceTypes';
import { FramingSimulator } from './FramingSimulator';

export function FramingSection({
  ev,
  summary,
}: {
  ev: EvaluateResponse | null;
  summary: DsoSummary;
}) {
  const { t, fmtNumber } = useI18n();
  const app = useApp();
  const rig = app.rigInput;
  const rec = ev?.evaluation.optics ?? null;
  const [opticsId, setOpticsId] = useState<string | null>(rec?.opticsId ?? null);
  const [focal, setFocal] = useState<number | null>(rec?.focalLengthMm ?? null);
  const [rotation, setRotation] = useState<number>(rec?.framing.rotationDeg ?? 90);
  useEffect(() => {
    if (rec) {
      setOpticsId(rec.opticsId);
      setFocal(rec.focalLengthMm);
      setRotation(rec.framing.rotationDeg ?? 90);
    }
  }, [rec?.opticsId, rec?.focalLengthMm, rec?.framing.rotationDeg]); // eslint-disable-line react-hooks/exhaustive-deps

  const optics = rig?.optics.find((o) => o.id === opticsId) ?? rig?.optics[0] ?? null;
  const range = useMemo(() => {
    if (!optics) return null;
    const m = opticsMultiplier(optics.spec);
    return {
      min: optics.spec.focalLengthMm * m,
      max: (isZoom(optics.spec) ? optics.spec.focalLengthMaxMm! : optics.spec.focalLengthMm) * m,
    };
  }, [optics]);
  const fl =
    focal !== null && range
      ? Math.min(Math.max(focal, range.min), range.max)
      : (range?.min ?? null);
  const framing = useMemo(() => {
    if (!rig || fl === null) return null;
    return evaluateFraming(
      {
        majorArcmin: summary.majorArcmin ?? 0,
        minorArcmin: summary.minorArcmin,
        positionAngleDeg: summary.positionAngleDeg,
      },
      {
        widthMm: rig.camera.sensorWidthMm,
        heightMm: rig.camera.sensorHeightMm,
        pixelPitchUm: cameraPixelPitchUm(rig.camera),
      },
      fl,
      app.settings.scoring.framingStyle,
      { minFill: app.settings.scoring.minFrameFill, minTargetPx: app.settings.scoring.minTargetPx },
    );
  }, [rig, fl, summary, app.settings.scoring]);

  if (!rig)
    return (
      <section className="card">
        <h2>{t('target.framing')}</h2>
        <p className="muted">{t('target.noRig')}</p>
      </section>
    );

  const orientationText = rec
    ? rec.framing.orientation === 'angled'
      ? t('framing.orientation.angled', { pa: fmtNumber(rec.framing.rotationDeg ?? 0, 0) })
      : t(`framing.orientation.${rec.framing.orientation}` as TKey)
    : null;

  return (
    <section className="card" aria-labelledby="framing-h">
      <h2 id="framing-h">{t('target.framing')}</h2>
      {rec && (
        <p className="small">
          <strong>{t('framing.recommendedFocal')}:</strong> {Math.round(rec.focalLengthMm)} mm (
          {app.equipment.optics.find((o) => o.id === rec.opticsId)?.name ?? '—'}) ·{' '}
          {t(`controls.${app.settings.scoring.framingStyle}` as TKey)}
          {orientationText && <> · {orientationText}</>}
        </p>
      )}
      {rec?.framing.mosaicSuggested && (
        <p style={{ color: 'var(--warn)' }}>{t('framing.mosaic')}</p>
      )}
      <div className="grid two">
        <div className="stack">
          <label className="field">
            <span className="label">{t('framing.optics')}</span>
            <select
              value={optics?.id ?? ''}
              onChange={(e) => {
                setOpticsId(e.target.value);
                setFocal(null);
              }}
            >
              {rig.optics.map((o) => (
                <option key={o.id} value={o.id}>
                  {app.equipment.optics.find((x) => x.id === o.id)?.name ?? o.id}
                </option>
              ))}
            </select>
          </label>
          {range && range.max > range.min && (
            <label className="field">
              <span className="label">
                {t('framing.focal')}: {fl !== null ? Math.round(fl) : '—'} mm
              </span>
              <input
                type="range"
                min={range.min}
                max={range.max}
                step={1}
                value={fl ?? range.min}
                onChange={(e) => setFocal(Number(e.target.value))}
              />
              <span className="hint">
                {t('framing.zoomRange', { min: Math.round(range.min), max: Math.round(range.max) })}
              </span>
            </label>
          )}
          <label className="field">
            <span className="label">
              {t('framing.rotate')}: {Math.round(rotation)}°
            </span>
            <input
              type="range"
              min={0}
              max={179}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
            />
          </label>
          {framing && (
            <dl className="kv">
              <dt>{t('framing.fov')}</dt>
              <dd>
                {t('framing.fovValue', {
                  w: fmtNumber(framing.fovWidthDeg, 2),
                  h: fmtNumber(framing.fovHeightDeg, 2),
                  d: fmtNumber(framing.fovDiagonalDeg, 2),
                })}
              </dd>
              <dt>{t('framing.pixelScale')}</dt>
              <dd>{fmtNumber(framing.pixelScaleArcsec, 2)} ″/px</dd>
              {Number.isFinite(framing.fill) && framing.fill > 0 && (
                <>
                  <dt>{t('framing.fill')}</dt>
                  <dd>{t('framing.fillValue', { pct: fmtNumber(framing.fill * 100, 1) })}</dd>
                  <dt>{t('framing.targetPx')}</dt>
                  <dd>{fmtNumber(framing.targetPx, 0)} px</dd>
                </>
              )}
              {framing.rotationDeg !== null && (
                <>
                  <dt>{t('framing.rotation')}</dt>
                  <dd>{t('framing.rotationValue', { pa: fmtNumber(framing.rotationDeg, 0) })}</dd>
                </>
              )}
            </dl>
          )}
          {framing?.mosaicSuggested && (
            <p className="small" style={{ color: 'var(--warn)' }}>
              {t('framing.mosaic')}
            </p>
          )}
        </div>
        {framing && (
          <div>
            <h3 className="small">{t('framing.simulator')}</h3>
            <FramingSimulator
              raDeg={summary.raDeg}
              decDeg={summary.decDeg}
              fovWidthDeg={framing.fovWidthDeg}
              fovHeightDeg={framing.fovHeightDeg}
              rotationDeg={rotation}
              majorArcmin={summary.majorArcmin}
              minorArcmin={summary.minorArcmin}
              targetPaDeg={summary.positionAngleDeg}
              targetLabel={summary.name}
            />
            <p className="tiny faint">{t('framing.simulatorHint')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
