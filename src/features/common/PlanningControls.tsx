import type { FramingStyle } from '../../astro/framing';
import type { CalendarDate } from '../../astro/time';
import { formatCalendarDate, parseCalendarDate } from '../../astro/time';
import { useApp } from '../../app/AppState';
import type { AvailabilityChoice } from '../../db/types';
import { useI18n } from '../../i18n/i18n';
import { Field, NumberInput, Segmented } from '../../ui/controls';

export function PlanningControls({
  date,
  onDate,
  showDate = true,
}: {
  date?: CalendarDate | null;
  onDate?: (d: CalendarDate | null) => void;
  showDate?: boolean;
}) {
  const { t } = useI18n();
  const app = useApp();
  const s = app.settings;
  return (
    <div className="row" style={{ alignItems: 'flex-end', gap: '0.75rem' }}>
      {showDate && date && onDate && (
        <Field label={t('controls.date')}>
          {(id) => (
            <input
              id={id}
              type="date"
              value={formatCalendarDate(date)}
              onChange={(e) => {
                try {
                  onDate(e.target.value ? parseCalendarDate(e.target.value) : null);
                } catch {
                  /* ignore partial input */
                }
              }}
              style={{ width: 'auto' }}
            />
          )}
        </Field>
      )}
      <div className="field">
        <span className="label">{t('controls.availability')}</span>
        <Segmented<AvailabilityChoice>
          label={t('controls.availability')}
          value={s.availability}
          onChange={(v) => void app.update({ availability: v })}
          options={[
            { value: 'night', label: t('controls.availNight') },
            { value: '30', label: t('controls.avail30') },
            { value: '60', label: t('controls.avail60') },
            { value: '90', label: t('controls.avail90') },
            { value: 'custom', label: t('controls.availCustom') },
          ]}
        />
      </div>
      {s.availability === 'custom' && (
        <Field label={t('controls.customMinutes')}>
          {(id) => (
            <NumberInput
              id={id}
              value={s.customAvailabilityMin}
              min={5}
              max={900}
              step={5}
              onChange={(v) =>
                v !== null &&
                void app.update({ customAvailabilityMin: Math.max(5, Math.min(900, v)) })
              }
            />
          )}
        </Field>
      )}
      <div className="field">
        <span className="label">{t('controls.exposureMode')}</span>
        <Segmented
          label={t('controls.exposureMode')}
          value={s.exposureMode}
          onChange={(v) => void app.update({ exposureMode: v })}
          options={[
            { value: 'tracking', label: t('controls.tracking') },
            { value: 'fixed', label: t('controls.fixed') },
          ]}
        />
      </div>
      <div className="field">
        <span className="label">{t('controls.framing')}</span>
        <Segmented<FramingStyle>
          label={t('controls.framing')}
          value={s.scoring.framingStyle}
          onChange={(v) => void app.update({ scoring: { ...s.scoring, framingStyle: v } })}
          options={[
            { value: 'wide', label: t('controls.wide') },
            { value: 'balanced', label: t('controls.balanced') },
            { value: 'tight', label: t('controls.tight') },
          ]}
        />
      </div>
    </div>
  );
}
