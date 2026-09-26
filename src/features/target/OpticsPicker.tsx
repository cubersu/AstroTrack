import { useApp } from '../../app/AppState';
import { apertureStops, isZoom, opticsMultiplier } from '../../astro/equipment';
import type { OpticsChoice } from '../../astro/scoring';
import { useI18n } from '../../i18n/i18n';
import { Field } from '../../ui/controls';
import type { OpticsSelection } from './opticsSelection';

/**
 * Optic / focal length / aperture chooser shared by the framing and recipe
 * sections. "Automatic" lets the engine pick; any other choice re-evaluates
 * the target for exactly that configuration.
 */
export function OpticsPicker({
  selection,
  onChange,
  current,
  auto,
  hint = false,
}: {
  selection: OpticsSelection | null;
  onChange: (s: OpticsSelection | null) => void;
  /** Optics of the current evaluation (reflects the selection once evaluated). */
  current: OpticsChoice | null;
  /** The engine's automatic choice, for labelling the "Automatic" option. */
  auto: OpticsChoice | null;
  /** Show the explanatory hint (once per page). */
  hint?: boolean;
}) {
  const { t, fmtNumber } = useI18n();
  const app = useApp();
  const rig = app.rigInput;
  if (!rig || rig.optics.length === 0) return null;
  const nameOf = (id: string) => app.equipment.optics.find((o) => o.id === id)?.name ?? id;
  const fmtF = (n: number) => `f/${fmtNumber(n, Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1)}`;

  const selected = selection ? rig.optics.find((o) => o.id === selection.opticsId) : undefined;
  const m = selected ? opticsMultiplier(selected.spec) : 1;
  const range = selected
    ? {
        min: selected.spec.focalLengthMm * m,
        max:
          (isZoom(selected.spec) ? selected.spec.focalLengthMaxMm! : selected.spec.focalLengthMm) *
          m,
      }
    : null;
  const evaluatedHere = current && selection && current.opticsId === selection.opticsId;
  const focal =
    selection?.focalLengthMm ?? (evaluatedHere ? current.focalLengthMm : (range?.min ?? null));
  const stops = selected && focal !== null ? apertureStops(selected.spec, focal / m) : [];
  const fValue =
    selection?.fNumber != null && stops.some((s) => Math.abs(s - selection.fNumber!) < 1e-6)
      ? String(selection.fNumber)
      : 'auto';

  return (
    <div className="form-grid optics-picker">
      <Field label={t('framing.optics')} hint={hint ? t('target.opticsHint') : undefined}>
        {(id) => (
          <select
            id={id}
            value={selection?.opticsId ?? ''}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? { opticsId: e.target.value, focalLengthMm: null, fNumber: null }
                  : null,
              )
            }
          >
            <option value="">
              {auto
                ? t('target.opticsAutoWith', {
                    name: nameOf(auto.opticsId),
                    focal: Math.round(auto.focalLengthMm),
                  })
                : t('target.opticsAuto')}
            </option>
            {rig.optics.map((o) => (
              <option key={o.id} value={o.id}>
                {nameOf(o.id)}
              </option>
            ))}
          </select>
        )}
      </Field>
      {selected && range && range.max > range.min && focal !== null && (
        <Field
          label={t('target.focalChoice', { focal: Math.round(focal) })}
          hint={t('target.focalRange', { min: Math.round(range.min), max: Math.round(range.max) })}
        >
          {(id) => (
            <input
              id={id}
              type="range"
              min={Math.round(range.min)}
              max={Math.round(range.max)}
              step={1}
              value={Math.round(focal)}
              onChange={(e) => onChange({ ...selection!, focalLengthMm: Number(e.target.value) })}
            />
          )}
        </Field>
      )}
      {selected && selected.spec.kind === 'lens' && stops.length > 1 && (
        <Field label={t('target.apertureChoice')}>
          {(id) => (
            <select
              id={id}
              value={fValue}
              onChange={(e) =>
                onChange({
                  ...selection!,
                  fNumber: e.target.value === 'auto' ? null : Number(e.target.value),
                })
              }
            >
              <option value="auto">
                {evaluatedHere && current.fNumber && selection!.fNumber === null
                  ? t('target.apertureAutoValue', { f: fmtF(current.fNumber) })
                  : t('target.apertureAutoPlain')}
              </option>
              {stops.map((s) => (
                <option key={s} value={String(s)}>
                  {fmtF(s)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </div>
  );
}
