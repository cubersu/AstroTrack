import { useState } from 'react';
import { useApp } from '../../app/AppState';
import { navigate } from '../../app/router';
import type { CalendarDate } from '../../astro/time';
import { addDays, formatCalendarDate } from '../../astro/time';
import type { DsoSummary } from '../../catalog/types';
import type { Plan, PlanType } from '../../db/types';
import { newId, userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import { Field, Modal, NumberInput, Segmented } from '../../ui/controls';
import type { EvaluateResponse } from '../../workers/serviceTypes';

export function PlanDialog({
  summary,
  ev,
  date,
  onClose,
}: {
  summary: DsoSummary;
  ev: EvaluateResponse | null;
  date: CalendarDate;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const app = useApp();
  const [type, setType] = useState<PlanType>('single');
  const [name, setName] = useState(
    `${summary.name}${summary.commonName ? ' — ' + summary.commonName : ''}`,
  );
  const [goalMode, setGoalMode] = useState<'recommended' | 'custom'>('recommended');
  const [goalHours, setGoalHours] = useState<number | null>(
    ev?.evaluation.integration ? Math.round(ev.evaluation.integration.recommendedH * 10) / 10 : 3,
  );
  const [nights, setNights] = useState<number | null>(5);
  const save = async () => {
    const now = Date.now();
    const e = ev?.evaluation;
    const plan: Plan = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      name,
      type,
      targetId: summary.id,
      targetName: summary.name + (summary.commonName ? ` (${summary.commonName})` : ''),
      locationId: app.location?.id ?? null,
      rigId: app.rig?.id ?? null,
      opticsId: e?.optics?.opticsId ?? null,
      focalLengthMm: e?.optics?.focalLengthMm ?? null,
      fNumber: e?.optics?.fNumber ?? null,
      exposureMode: app.settings.exposureMode,
      filterId: e?.filterId ?? null,
      subExposureS: e?.sub?.recommendedS ?? null,
      isoGain: '',
      goalMode,
      goalHours: goalMode === 'custom' ? goalHours : null,
      startDate: formatCalendarDate(date),
      nights:
        type === 'single'
          ? [formatCalendarDate(date)]
          : Array.from({ length: Math.max(1, Math.min(60, nights ?? 5)) }, (_, i) =>
              formatCalendarDate(addDays(date, i)),
            ),
      status: 'active',
      notes: '',
    };
    await userDb().plans.put(plan);
    onClose();
    navigate(`/plans/${plan.id}`);
  };
  return (
    <Modal
      title={t('target.createPlan')}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void save()}
            disabled={!name.trim()}
          >
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label={t('plans.planName')}>
          {(id) => (
            <input id={id} type="text" value={name} onChange={(e) => setName(e.target.value)} />
          )}
        </Field>
        <div className="field">
          <span className="label">{t('plans.type')}</span>
          <Segmented<PlanType>
            label={t('plans.type')}
            value={type}
            onChange={setType}
            options={[
              { value: 'single', label: t('plans.single') },
              { value: 'multi', label: t('plans.multi') },
            ]}
          />
        </div>
        {type === 'multi' && (
          <Field label={t('plans.nights')}>
            {(id) => (
              <NumberInput id={id} value={nights} min={1} max={60} step={1} onChange={setNights} />
            )}
          </Field>
        )}
        <div className="field">
          <span className="label">{t('plans.goal')}</span>
          <Segmented<'recommended' | 'custom'>
            label={t('plans.goal')}
            value={goalMode}
            onChange={setGoalMode}
            options={[
              { value: 'recommended', label: t('plans.goalRecommended') },
              { value: 'custom', label: t('plans.goalCustom') },
            ]}
          />
        </div>
        {goalMode === 'custom' && (
          <Field label={t('plans.goalHours')}>
            {(id) => (
              <NumberInput id={id} value={goalHours} min={0.1} max={200} onChange={setGoalHours} />
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
