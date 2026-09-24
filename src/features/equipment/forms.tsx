import { useState } from 'react';
import type { EquipmentSet } from '../../app/rig';
import type { CameraKind, Modification, OpticsKind, SensorColor } from '../../astro/equipment';
import { cropFactor } from '../../astro/equipment';
import type { FilterKind } from '../../astro/lightPollution';
import { derivePixelPitchUm } from '../../astro/pixelScale';
import type {
  CameraProfile,
  FilterProfile,
  MountProfile,
  OpticsProfile,
  RigProfile,
} from '../../db/types';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Checkbox, Field, Modal, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { hasErrors, validateCamera, validateOptics } from './validation';

type Draft<T> = Omit<T, 'createdAt' | 'updatedAt' | 'id'> & { id?: string; createdAt?: number };

function Actions({
  onClose,
  onSave,
  disabled,
}: {
  onClose: () => void;
  onSave: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="btn" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button type="button" className="btn primary" onClick={onSave} disabled={disabled}>
        {t('common.save')}
      </button>
    </>
  );
}

export function CameraForm({
  initial,
  onClose,
  onSave,
}: {
  initial: CameraProfile | null;
  onClose: () => void;
  onSave: (c: Draft<CameraProfile>) => Promise<void>;
}) {
  const { t, fmtNumber } = useI18n();
  const [c, setC] = useState<Draft<CameraProfile>>(
    initial ?? {
      name: '',
      sensorWidthMm: 0,
      sensorHeightMm: 0,
      resolutionX: 0,
      resolutionY: 0,
      pixelPitchUm: null,
      color: 'color',
      kind: 'dslr',
      modification: 'stock',
      advanced: null,
    },
  );
  const [touched, setTouched] = useState(false);
  const errors = validateCamera(c);
  const err = (k: keyof CameraProfile) => (touched && errors[k] ? t(errors[k] as TKey) : undefined);
  const set = <K extends keyof CameraProfile>(k: K, v: CameraProfile[K]) =>
    setC((x) => ({ ...x, [k]: v }));
  const adv = c.advanced ?? {};
  const setAdv = (k: keyof NonNullable<CameraProfile['advanced']>, v: number | null) =>
    setC((x) => ({ ...x, advanced: { ...(x.advanced ?? {}), [k]: v } }));
  const derived =
    c.sensorWidthMm > 0 && c.sensorHeightMm > 0 && c.resolutionX > 0 && c.resolutionY > 0
      ? derivePixelPitchUm(c.sensorWidthMm, c.sensorHeightMm, c.resolutionX, c.resolutionY)
      : null;
  return (
    <Modal
      title={initial ? t('common.edit') : t('equipment.newCamera')}
      onClose={onClose}
      actions={
        <Actions
          onClose={onClose}
          onSave={() => {
            setTouched(true);
            if (!hasErrors(errors)) void onSave(c);
          }}
        />
      }
    >
      <div className="form-grid">
        <Field label={t('common.name')} error={err('name')} className="full">
          {(id) => (
            <input
              id={id}
              type="text"
              value={c.name}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('equipment.camera.sensorWidth')} error={err('sensorWidthMm')}>
          {(id) => (
            <NumberInput
              id={id}
              value={c.sensorWidthMm || null}
              onChange={(v) => set('sensorWidthMm', v ?? 0)}
            />
          )}
        </Field>
        <Field label={t('equipment.camera.sensorHeight')} error={err('sensorHeightMm')}>
          {(id) => (
            <NumberInput
              id={id}
              value={c.sensorHeightMm || null}
              onChange={(v) => set('sensorHeightMm', v ?? 0)}
            />
          )}
        </Field>
        <Field label={t('equipment.camera.resX')} error={err('resolutionX')}>
          {(id) => (
            <NumberInput
              id={id}
              step={1}
              value={c.resolutionX || null}
              onChange={(v) => set('resolutionX', v ?? 0)}
            />
          )}
        </Field>
        <Field label={t('equipment.camera.resY')} error={err('resolutionY')}>
          {(id) => (
            <NumberInput
              id={id}
              step={1}
              value={c.resolutionY || null}
              onChange={(v) => set('resolutionY', v ?? 0)}
            />
          )}
        </Field>
        <Field
          label={t('equipment.camera.pixelPitch')}
          hint={
            derived
              ? `${t('equipment.camera.derivedPitch', { pitch: fmtNumber(derived.pitchUm, 2) })}${derived.consistent ? '' : ' — ' + t('equipment.camera.inconsistent')}`
              : t('equipment.camera.pixelPitchHint')
          }
          error={err('pixelPitchUm')}
          className="full"
        >
          {(id) => (
            <NumberInput
              id={id}
              value={c.pixelPitchUm}
              onChange={(v) => set('pixelPitchUm', v)}
              placeholder={derived ? fmtNumber(derived.pitchUm, 2) : ''}
            />
          )}
        </Field>
        <Field label={t('equipment.camera.kind')}>
          {(id) => (
            <select
              id={id}
              value={c.kind}
              onChange={(e) => {
                const kind = e.target.value as CameraKind;
                setC((x) => ({ ...x, kind, color: kind === 'mono-astro' ? 'mono' : 'color' }));
              }}
            >
              {(['dslr', 'mirrorless', 'osc-astro', 'mono-astro'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`cameraKind.${k}` as TKey)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('equipment.camera.color')}>
          {(id) => (
            <select
              id={id}
              value={c.color}
              onChange={(e) => set('color', e.target.value as SensorColor)}
            >
              <option value="color">{t('sensorColor.color')}</option>
              <option value="mono">{t('sensorColor.mono')}</option>
            </select>
          )}
        </Field>
        <Field label={t('equipment.camera.modification')} className="full">
          {(id) => (
            <select
              id={id}
              value={c.modification}
              onChange={(e) => set('modification', e.target.value as Modification)}
            >
              {(['stock', 'astro-modified', 'full-spectrum'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`modification.${k}` as TKey)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      {c.sensorWidthMm > 0 && c.sensorHeightMm > 0 && (
        <p className="small muted">
          {t('equipment.camera.crop', { crop: fmtNumber(cropFactor(c), 2) })}
        </p>
      )}
      <details style={{ marginTop: '0.75rem' }}>
        <summary>{t('equipment.camera.advanced')}</summary>
        <p className="tiny faint">{t('equipment.camera.advancedHint')}</p>
        <div className="form-grid">
          <Field label={t('equipment.camera.readNoise')}>
            {(id) => (
              <NumberInput
                id={id}
                value={adv.readNoiseE ?? null}
                onChange={(v) => setAdv('readNoiseE', v)}
              />
            )}
          </Field>
          <Field label={t('equipment.camera.fullWell')}>
            {(id) => (
              <NumberInput
                id={id}
                value={adv.fullWellE ?? null}
                onChange={(v) => setAdv('fullWellE', v)}
              />
            )}
          </Field>
          <Field label={t('equipment.camera.gain')}>
            {(id) => (
              <NumberInput
                id={id}
                value={adv.gainEPerAdu ?? null}
                onChange={(v) => setAdv('gainEPerAdu', v)}
              />
            )}
          </Field>
          <Field label={t('equipment.camera.dynamicRange')}>
            {(id) => (
              <NumberInput
                id={id}
                value={adv.dynamicRangeStops ?? null}
                onChange={(v) => setAdv('dynamicRangeStops', v)}
              />
            )}
          </Field>
          <Field label={t('equipment.camera.qe')}>
            {(id) => (
              <NumberInput
                id={id}
                min={0}
                max={1}
                value={adv.qe ?? null}
                onChange={(v) => setAdv('qe', v === null ? null : Math.min(1, Math.max(0, v)))}
              />
            )}
          </Field>
        </div>
      </details>
    </Modal>
  );
}

export function OpticsForm({
  initial,
  onClose,
  onSave,
}: {
  initial: OpticsProfile | null;
  onClose: () => void;
  onSave: (o: Draft<OpticsProfile>) => Promise<void>;
}) {
  const { t, fmtNumber } = useI18n();
  const [o, setO] = useState<Draft<OpticsProfile>>(
    initial ?? {
      name: '',
      kind: 'lens',
      focalLengthMm: 0,
      focalLengthMaxMm: null,
      apertureMm: null,
      fNumber: null,
      fNumberAtMax: null,
      preferredFNumber: 'auto',
      multiplier: null,
    },
  );
  const [zoom, setZoom] = useState(!!initial?.focalLengthMaxMm);
  const [touched, setTouched] = useState(false);
  const errors = validateOptics(o, zoom);
  const err = (k: keyof OpticsProfile) => (touched && errors[k] ? t(errors[k] as TKey) : undefined);
  const set = <K extends keyof OpticsProfile>(k: K, v: OpticsProfile[K]) =>
    setO((x) => ({ ...x, [k]: v }));
  const derivedF = o.focalLengthMm > 0 && o.apertureMm ? o.focalLengthMm / o.apertureMm : null;
  const derivedD = o.focalLengthMm > 0 && o.fNumber ? o.focalLengthMm / o.fNumber : null;
  return (
    <Modal
      title={initial ? t('common.edit') : t('equipment.newOptics')}
      onClose={onClose}
      actions={
        <Actions
          onClose={onClose}
          onSave={() => {
            setTouched(true);
            if (!hasErrors(errors))
              void onSave({
                ...o,
                focalLengthMaxMm: zoom ? o.focalLengthMaxMm : null,
                fNumberAtMax: zoom ? o.fNumberAtMax : null,
              });
          }}
        />
      }
    >
      <div className="form-grid">
        <Field label={t('common.name')} error={err('name')} className="full">
          {(id) => (
            <input
              id={id}
              type="text"
              value={o.name}
              onChange={(e) => set('name', e.target.value)}
            />
          )}
        </Field>
        <Field label={t('equipment.optics.kind')}>
          {(id) => (
            <select
              id={id}
              value={o.kind}
              onChange={(e) => {
                const kind = e.target.value as OpticsKind;
                set('kind', kind);
                if (kind === 'telescope') setZoom(false);
              }}
            >
              <option value="lens">{t('opticsKind.lens')}</option>
              <option value="telescope">{t('opticsKind.telescope')}</option>
            </select>
          )}
        </Field>
        {o.kind === 'lens' && (
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <Checkbox checked={zoom} onChange={setZoom}>
              {t('equipment.optics.zoom')}
            </Checkbox>
          </div>
        )}
        <Field
          label={zoom ? t('equipment.optics.focalMin') : t('equipment.optics.focal')}
          error={err('focalLengthMm')}
        >
          {(id) => (
            <NumberInput
              id={id}
              value={o.focalLengthMm || null}
              onChange={(v) => set('focalLengthMm', v ?? 0)}
            />
          )}
        </Field>
        {zoom && (
          <Field label={t('equipment.optics.focalMax')} error={err('focalLengthMaxMm')}>
            {(id) => (
              <NumberInput
                id={id}
                value={o.focalLengthMaxMm}
                onChange={(v) => set('focalLengthMaxMm', v)}
              />
            )}
          </Field>
        )}
        <Field
          label={t('equipment.optics.aperture')}
          hint={
            derivedD
              ? t('equipment.optics.derivedAperture', { d: fmtNumber(derivedD, 1) })
              : undefined
          }
        >
          {(id) => (
            <NumberInput id={id} value={o.apertureMm} onChange={(v) => set('apertureMm', v)} />
          )}
        </Field>
        <Field
          label={t('equipment.optics.fNumber')}
          hint={
            derivedF ? t('equipment.optics.derivedF', { f: fmtNumber(derivedF, 1) }) : undefined
          }
          error={err('fNumber')}
        >
          {(id) => <NumberInput id={id} value={o.fNumber} onChange={(v) => set('fNumber', v)} />}
        </Field>
        {zoom && (
          <Field label={t('equipment.optics.fNumberAtMax')}>
            {(id) => (
              <NumberInput
                id={id}
                value={o.fNumberAtMax}
                onChange={(v) => set('fNumberAtMax', v)}
              />
            )}
          </Field>
        )}
        {o.kind === 'lens' && (
          <Field label={t('equipment.optics.preferred')} error={err('preferredFNumber')}>
            {(id) => (
              <div className="row">
                <select
                  id={id}
                  value={
                    o.preferredFNumber === 'auto' || o.preferredFNumber === null ? 'auto' : 'manual'
                  }
                  onChange={(e) =>
                    set(
                      'preferredFNumber',
                      e.target.value === 'auto' ? 'auto' : (o.fNumber ?? 4) * 1.4,
                    )
                  }
                  style={{ width: 'auto' }}
                >
                  <option value="auto">{t('equipment.optics.preferredAuto')}</option>
                  <option value="manual">{t('equipment.optics.preferredManual')}</option>
                </select>
                {typeof o.preferredFNumber === 'number' && (
                  <span style={{ width: 100 }}>
                    <NumberInput
                      value={o.preferredFNumber}
                      onChange={(v) => set('preferredFNumber', v ?? 'auto')}
                    />
                  </span>
                )}
              </div>
            )}
          </Field>
        )}
        <Field
          label={t('equipment.optics.multiplier')}
          hint={t('equipment.optics.multiplierHint')}
          error={err('multiplier')}
        >
          {(id) => (
            <NumberInput id={id} value={o.multiplier} onChange={(v) => set('multiplier', v)} />
          )}
        </Field>
      </div>
    </Modal>
  );
}

export function MountForm({
  initial,
  onClose,
  onSave,
}: {
  initial: MountProfile | null;
  onClose: () => void;
  onSave: (m: Draft<MountProfile>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [m, setM] = useState<Draft<MountProfile>>(
    initial ?? {
      name: '',
      tracking: true,
      equatorial: true,
      guiding: false,
      payloadKg: null,
      calibration: [],
    },
  );
  const valid =
    m.name.trim().length > 0 &&
    m.calibration.every((p) => p.focalLengthMm > 0 && p.reliableExposureS > 0);
  return (
    <Modal
      title={initial ? t('common.edit') : t('equipment.newMount')}
      onClose={onClose}
      actions={
        <Actions onClose={onClose} onSave={() => valid && void onSave(m)} disabled={!valid} />
      }
    >
      <div className="form-grid">
        <Field label={t('common.name')} className="full">
          {(id) => (
            <input
              id={id}
              type="text"
              value={m.name}
              onChange={(e) => setM({ ...m, name: e.target.value })}
            />
          )}
        </Field>
        <Checkbox
          checked={m.tracking}
          onChange={(v) =>
            setM({
              ...m,
              tracking: v,
              equatorial: v ? m.equatorial : false,
              guiding: v ? m.guiding : false,
            })
          }
        >
          {t('equipment.mount.tracking')}
        </Checkbox>
        <Checkbox checked={m.equatorial} onChange={(v) => setM({ ...m, equatorial: v })}>
          {t('equipment.mount.equatorial')}
        </Checkbox>
        <Checkbox checked={m.guiding} onChange={(v) => setM({ ...m, guiding: v })}>
          {t('equipment.mount.guiding')}
        </Checkbox>
        <Field label={t('equipment.mount.payload')}>
          {(id) => (
            <NumberInput
              id={id}
              value={m.payloadKg}
              onChange={(v) => setM({ ...m, payloadKg: v })}
            />
          )}
        </Field>
      </div>
      <h3 style={{ marginTop: '0.75rem' }}>{t('equipment.mount.calibration')}</h3>
      <p className="tiny faint">{t('equipment.mount.calibrationHint')}</p>
      {m.calibration.map((p, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <span style={{ width: 130 }}>
            <NumberInput
              value={p.focalLengthMm || null}
              placeholder={t('equipment.mount.focal')}
              onChange={(v) => {
                const c = [...m.calibration];
                c[i] = { ...p, focalLengthMm: v ?? 0 };
                setM({ ...m, calibration: c });
              }}
            />
          </span>
          <span className="small">mm →</span>
          <span style={{ width: 110 }}>
            <NumberInput
              value={p.reliableExposureS || null}
              placeholder={t('equipment.mount.exposure')}
              onChange={(v) => {
                const c = [...m.calibration];
                c[i] = { ...p, reliableExposureS: v ?? 0 };
                setM({ ...m, calibration: c });
              }}
            />
          </span>
          <span className="small">s</span>
          {p.source === 'journal' && (
            <span className="badge info">{t('equipment.mount.fromJournal')}</span>
          )}
          <button
            type="button"
            className="btn small danger"
            aria-label={t('common.delete')}
            onClick={() => setM({ ...m, calibration: m.calibration.filter((_, k) => k !== i) })}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small"
        onClick={() =>
          setM({
            ...m,
            calibration: [
              ...m.calibration,
              { focalLengthMm: 0, reliableExposureS: 0, source: 'manual' },
            ],
          })
        }
      >
        <Icon name="plus" /> {t('equipment.mount.addPoint')}
      </button>
    </Modal>
  );
}

export function FilterForm({
  initial,
  onClose,
  onSave,
}: {
  initial: FilterProfile | null;
  onClose: () => void;
  onSave: (f: Draft<FilterProfile>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [f, setF] = useState<Draft<FilterProfile>>(
    initial ?? { name: '', kind: 'dual-band', bands: [] },
  );
  const valid =
    f.name.trim().length > 0 &&
    f.bands.every((b) => b.centerNm > 250 && b.centerNm < 1200 && b.bandwidthNm > 0);
  return (
    <Modal
      title={initial ? t('common.edit') : t('equipment.newFilter')}
      onClose={onClose}
      actions={
        <Actions onClose={onClose} onSave={() => valid && void onSave(f)} disabled={!valid} />
      }
    >
      <div className="form-grid">
        <Field label={t('common.name')} className="full">
          {(id) => (
            <input
              id={id}
              type="text"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('equipment.filter.kind')} className="full">
          {(id) => (
            <select
              id={id}
              value={f.kind}
              onChange={(e) => setF({ ...f, kind: e.target.value as FilterKind })}
            >
              {(
                [
                  'uv-ir-cut',
                  'broadband-lp',
                  'cls-uhc',
                  'dual-band',
                  'narrowband',
                  'custom',
                ] as const
              ).map((k) => (
                <option key={k} value={k}>
                  {t(`filterKind.${k}` as TKey)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <h3 style={{ marginTop: '0.75rem' }}>{t('equipment.filter.bands')}</h3>
      {f.kind === 'custom' && <p className="tiny faint">{t('equipment.filter.customHint')}</p>}
      {f.bands.map((b, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <span style={{ width: 120 }}>
            <NumberInput
              value={b.centerNm || null}
              placeholder={t('equipment.filter.center')}
              onChange={(v) => {
                const bands = [...f.bands];
                bands[i] = { ...b, centerNm: v ?? 0 };
                setF({ ...f, bands });
              }}
            />
          </span>
          <span style={{ width: 120 }}>
            <NumberInput
              value={b.bandwidthNm || null}
              placeholder={t('equipment.filter.width')}
              onChange={(v) => {
                const bands = [...f.bands];
                bands[i] = { ...b, bandwidthNm: v ?? 0 };
                setF({ ...f, bands });
              }}
            />
          </span>
          <span className="small">nm</span>
          <button
            type="button"
            className="btn small danger"
            aria-label={t('common.delete')}
            onClick={() => setF({ ...f, bands: f.bands.filter((_, k) => k !== i) })}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small"
        onClick={() => setF({ ...f, bands: [...f.bands, { centerNm: 656.3, bandwidthNm: 7 }] })}
      >
        <Icon name="plus" /> {t('equipment.filter.addBand')}
      </button>
    </Modal>
  );
}

export function RigForm({
  initial,
  equipment,
  onClose,
  onSave,
}: {
  initial: RigProfile | null;
  equipment: EquipmentSet;
  onClose: () => void;
  onSave: (r: Draft<RigProfile>) => Promise<void>;
}) {
  const { t } = useI18n();
  const [r, setR] = useState<Draft<RigProfile>>(
    initial ?? {
      name: '',
      cameraId: equipment.cameras[0]?.id ?? '',
      opticsIds: [],
      mountId: equipment.mounts[0]?.id ?? null,
      filterIds: [],
    },
  );
  const valid = r.name.trim() && r.cameraId && r.opticsIds.length > 0;
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  return (
    <Modal
      title={initial ? t('common.edit') : t('equipment.newRig')}
      onClose={onClose}
      actions={
        <Actions onClose={onClose} onSave={() => valid && void onSave(r)} disabled={!valid} />
      }
    >
      <div className="stack">
        <Field label={t('common.name')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={r.name}
              onChange={(e) => setR({ ...r, name: e.target.value })}
            />
          )}
        </Field>
        <Field
          label={t('equipment.rig.camera')}
          error={equipment.cameras.length === 0 ? t('equipment.rig.needCamera') : undefined}
        >
          {(id) => (
            <select
              id={id}
              value={r.cameraId}
              onChange={(e) => setR({ ...r, cameraId: e.target.value })}
            >
              {equipment.cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="small muted">{t('equipment.rig.optics')}</legend>
          {equipment.optics.length === 0 && (
            <span className="error small">{t('equipment.rig.needOptics')}</span>
          )}
          {equipment.optics.map((o) => (
            <Checkbox
              key={o.id}
              checked={r.opticsIds.includes(o.id)}
              onChange={() => setR({ ...r, opticsIds: toggle(r.opticsIds, o.id) })}
            >
              {o.name}
            </Checkbox>
          ))}
        </fieldset>
        <Field label={t('equipment.rig.mount')}>
          {(id) => (
            <select
              id={id}
              value={r.mountId ?? ''}
              onChange={(e) => setR({ ...r, mountId: e.target.value || null })}
            >
              <option value="">{t('equipment.rig.noMount')}</option>
              {equipment.mounts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <fieldset className="stack" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="small muted">{t('equipment.rig.filters')}</legend>
          {equipment.filters.map((f) => (
            <Checkbox
              key={f.id}
              checked={r.filterIds.includes(f.id)}
              onChange={() => setR({ ...r, filterIds: toggle(r.filterIds, f.id) })}
            >
              {f.name}
            </Checkbox>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
}
