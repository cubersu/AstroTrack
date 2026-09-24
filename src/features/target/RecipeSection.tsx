import { useState } from 'react';
import { useApp } from '../../app/AppState';
import { cameraPixelPitchUm, cropFactor } from '../../astro/equipment';
import type {
  CalibrationFeedback,
  Clipping,
  HistogramBucket,
  StarShape,
} from '../../astro/exposure';
import { isoGuidance, suggestFromTestFrame } from '../../astro/exposure';
import {
  effectiveTrailingDec,
  fixedTripodOptions,
  rule500Seconds,
  TRAILING_MULTIPLIERS,
} from '../../astro/npf';
import { newId, userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Field, NumberInput, Segmented } from '../../ui/controls';
import { useToast } from '../../ui/toast';
import type { EvaluateResponse } from '../../workers/serviceTypes';
import { ConfidenceBadge } from '../common/ScoreViews';
import type { DsoSummary } from '../../catalog/types';

export function lightsFor(hours: number, subS: number): number {
  return subS > 0 ? Math.ceil((hours * 3600) / subS) : 0;
}

function CalibrationWorkflow({ ev }: { ev: EvaluateResponse }) {
  const { t, td } = useI18n();
  const app = useApp();
  const toast = useToast();
  const e = ev.evaluation;
  const [sub, setSub] = useState<number | null>(e.sub?.recommendedS ?? 60);
  const [fb, setFb] = useState<CalibrationFeedback>({
    histogram: '10-20',
    stars: 'round',
    clipping: 'none',
  });
  const [res, setRes] = useState<ReturnType<typeof suggestFromTestFrame> | null>(null);
  const focal = e.optics?.focalLengthMm ?? null;
  const mount = app.equipment.mounts.find((m) => m.id === app.rig?.mountId);
  return (
    <details style={{ marginTop: '0.75rem' }}>
      <summary>{t('recipe.calibrationWorkflow')}</summary>
      <p className="tiny faint">{t('recipe.calibrationHint')}</p>
      <div className="form-grid">
        <Field label={t('recipe.currentSub')}>
          {(id) => <NumberInput id={id} value={sub} onChange={setSub} min={0.1} />}
        </Field>
        <div className="field">
          <span className="label">{t('recipe.histogram')}</span>
          <Segmented<HistogramBucket>
            label={t('recipe.histogram')}
            value={fb.histogram}
            onChange={(v) => setFb({ ...fb, histogram: v })}
            options={(['<5', '5-10', '10-20', '20-30', '>30'] as const).map((v) => ({
              value: v,
              label: `${v}%`,
            }))}
          />
        </div>
        <div className="field">
          <span className="label">{t('recipe.stars')}</span>
          <Segmented<StarShape>
            label={t('recipe.stars')}
            value={fb.stars}
            onChange={(v) => setFb({ ...fb, stars: v })}
            options={(['round', 'mild', 'obvious'] as const).map((v) => ({
              value: v,
              label: t(`recipe.starShape.${v}` as TKey),
            }))}
          />
        </div>
        <div className="field">
          <span className="label">{t('recipe.clipping')}</span>
          <Segmented<Clipping>
            label={t('recipe.clipping')}
            value={fb.clipping}
            onChange={(v) => setFb({ ...fb, clipping: v })}
            options={(['none', 'mild', 'excessive'] as const).map((v) => ({
              value: v,
              label: t(`recipe.clip.${v}` as TKey),
            }))}
          />
        </div>
      </div>
      <button
        type="button"
        className="btn primary"
        style={{ marginTop: '0.5rem' }}
        disabled={!sub}
        onClick={() =>
          sub && setRes(suggestFromTestFrame(sub, fb, e.maxSubS ?? Number.POSITIVE_INFINITY))
        }
      >
        {t('recipe.suggest')}
      </button>
      {res && (
        <div className="card tight" style={{ marginTop: '0.5rem' }} aria-live="polite">
          <strong>{t('recipe.suggestion', { sec: res.suggestedS })}</strong>
          <ul className="small">
            {res.advice.map((a) => (
              <li key={a}>{td(`recipe.advice.${a}`)}</li>
            ))}
          </ul>
          <div className="row">
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                await userDb().exposureCalibrations.put({
                  id: newId(),
                  createdAt: Date.now(),
                  cameraId: app.rig?.cameraId ?? null,
                  opticsId: e.optics?.opticsId ?? null,
                  focalLengthMm: focal ?? 0,
                  fNumber: e.optics?.fNumber ?? null,
                  isoGain: '',
                  subExposureS: res.currentS,
                  histogram: fb.histogram,
                  stars: fb.stars,
                  clipping: fb.clipping,
                  suggestedS: res.suggestedS,
                  bortle: app.sky.bortle,
                });
                toast(t('common.saved'));
              }}
            >
              {t('recipe.saveCalibration')}
            </button>
            {res.suggestMountCalibration &&
              mount &&
              focal &&
              app.settings.exposureMode === 'tracking' && (
                <button
                  type="button"
                  className="btn small"
                  onClick={async () => {
                    await userDb().mounts.update(mount.id, {
                      calibration: [
                        ...mount.calibration,
                        {
                          focalLengthMm: Math.round(focal),
                          reliableExposureS: res.currentS,
                          source: 'manual',
                        },
                      ],
                      updatedAt: Date.now(),
                    });
                    toast(t('journal.calibrationAdded'));
                  }}
                >
                  {t('recipe.useAsMountPoint', { focal: Math.round(focal), sec: res.currentS })}
                </button>
              )}
          </div>
        </div>
      )}
    </details>
  );
}

export function RecipeSection({ ev, summary }: { ev: EvaluateResponse; summary: DsoSummary }) {
  const { t, fmtNumber, fmtDuration, fmtTime, td } = useI18n();
  const app = useApp();
  const rig = app.rigInput!;
  const e = ev.evaluation;
  const o = e.optics;
  const opticsName = app.equipment.optics.find((x) => x.id === o?.opticsId)?.name ?? '—';
  const iso = isoGuidance(rig.camera, app.sky.sqm);
  const integ = e.integration;
  const sub = e.sub;
  const fixed = app.settings.exposureMode === 'fixed' || !rig.mount.tracking;
  const pitch = cameraPixelPitchUm(rig.camera);
  const effDec = o ? effectiveTrailingDec(summary.decDeg, o.framing.fovHeightDeg) : summary.decDeg;
  const npf =
    o && o.fNumber
      ? fixedTripodOptions(o.fNumber, o.focalLengthMm, pitch, effDec, TRAILING_MULTIPLIERS)
      : null;
  const cmosAstro = rig.camera.kind === 'osc-astro' || rig.camera.kind === 'mono-astro';
  return (
    <section className="card" aria-labelledby="recipe-h">
      <h2 id="recipe-h" className="row between">
        {t('target.recipe')}{' '}
        <ConfidenceBadge level={e.confidence.level} factors={e.confidence.factors} />
      </h2>
      <dl className="kv">
        <dt>{t('recipe.optics')}</dt>
        <dd>{opticsName}</dd>
        {o && (
          <>
            <dt>{t('recipe.focal')}</dt>
            <dd>{Math.round(o.focalLengthMm)} mm</dd>
            <dt>{t('recipe.aperture')}</dt>
            <dd>
              {o.fNumber ? `f/${fmtNumber(o.fNumber, 1)}` : '—'}{' '}
              <span className="tiny muted">
                (
                {o.apertureBasis === 'user'
                  ? t('recipe.apertureUser')
                  : o.apertureBasis === 'wide-open'
                    ? t('recipe.apertureWideOpen')
                    : t('common.approximate')}
                )
              </span>
              {o.warnAberrations && (
                <div className="tiny" style={{ color: 'var(--warn)' }}>
                  {t('recipe.apertureAuto')}
                </div>
              )}
            </dd>
          </>
        )}
        <dt>{iso.kind === 'iso' ? t('recipe.iso') : t('recipe.gain')}</dt>
        <dd>
          {iso.kind === 'iso'
            ? t('recipe.isoRange', { min: iso.isoMin!, max: iso.isoMax! })
            : t('recipe.gainAdvice')}
          {iso.approximate && <div className="tiny faint">{t('recipe.isoApprox')}</div>}
        </dd>
        {sub && (
          <>
            <dt>{t('recipe.subRecommended')}</dt>
            <dd>
              <strong>{sub.recommendedS} s</strong> (
              {t('recipe.subRange', { min: sub.minS, max: sub.maxS })}) —{' '}
              <span className="small muted">{td(`recipe.limitedBy.${sub.limitedBy}`)}</span>
            </dd>
          </>
        )}
        {e.maxSubS !== null && (
          <>
            <dt>{t('recipe.maxSub')}</dt>
            <dd>
              {fmtNumber(e.maxSubS, e.maxSubS < 10 ? 1 : 0)} s{' '}
              <span className="tiny muted">({td(`recipe.trackingSource.${e.maxSubSource}`)})</span>
            </dd>
          </>
        )}
      </dl>
      {fixed && npf && o && (
        <div className="card tight" style={{ marginTop: '0.75rem' }}>
          <h3>{t('recipe.fixedTitle')}</h3>
          <p className="tiny faint">{t('recipe.fixedHint')}</p>
          <table className="data">
            <tbody>
              {npf.map((opt) => (
                <tr key={opt.tolerance}>
                  <th scope="row">{t(`recipe.tolerance.${opt.tolerance}` as TKey)}</th>
                  <td>
                    <strong>{fmtNumber(opt.exposureS, 1)} s</strong>
                  </td>
                  <td>{t('recipe.trail', { px: fmtNumber(opt.trailPx, 1) })}</td>
                  <td className="tiny muted" style={{ whiteSpace: 'normal' }}>
                    {t(`recipe.toleranceHint.${opt.tolerance}` as TKey)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="tiny faint">
            {t('recipe.effectiveDec', { dec: fmtNumber(effDec, 1) })} ·{' '}
            {t('recipe.rule500', {
              sec: fmtNumber(rule500Seconds(o.focalLengthMm, cropFactor(rig.camera)), 1),
            })}
          </p>
        </div>
      )}
      {integ && (
        <div style={{ marginTop: '0.75rem' }}>
          <h3>{t('recipe.integration')}</h3>
          <div className="stats">
            {(
              [
                ['minimum', integ.minimumH],
                ['recommended', integ.recommendedH],
                ['ideal', integ.idealH],
              ] as const
            ).map(([k, h]) => (
              <div className="stat" key={k}>
                <span className="l">{t(`recipe.${k}` as TKey)}</span>
                <span className="v">{fmtDuration(h)}</span>
                {sub && (
                  <span className="l">
                    {t('recipe.lightsValue', {
                      count: lightsFor(h, sub.recommendedS),
                      sub: sub.recommendedS,
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="tiny faint">{t('recipe.snrNote')}</p>
        </div>
      )}
      {e.window && (
        <p className="small">
          <strong>{t('recipe.bestWindow')}:</strong> {fmtTime(e.window.startMs)}–
          {fmtTime(e.window.endMs)}
        </p>
      )}
      <details style={{ marginTop: '0.5rem' }}>
        <summary>{t('recipe.calibration')}</summary>
        <ul className="small">
          <li>{t('recipe.darks')}</li>
          <li>{t('recipe.flats')}</li>
          <li>{cmosAstro ? t('recipe.darkFlats') : t('recipe.bias')}</li>
        </ul>
        <p className="tiny faint">{t('recipe.workflowNote')}</p>
      </details>
      <p className="tiny faint" style={{ marginTop: '0.5rem' }}>
        <strong>{t('target.physical')}:</strong> {t('recipe.physicalNote')}
        <br />
        <strong>{t('target.empirical')}:</strong> {t('recipe.empiricalNote')}
      </p>
      <CalibrationWorkflow ev={ev} />
    </section>
  );
}
