import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogApi } from '../../app/catalogClient';
import { useQueryParam } from '../../app/router';
import type { StarShape } from '../../astro/exposure';
import { downloadText, journalToCsv } from '../../db/backup';
import type { JournalEntry } from '../../db/types';
import { newId, userDb } from '../../db/userDb';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Checkbox, EmptyState, Field, Modal, NumberInput, Segmented } from '../../ui/controls';
import { useLiveQuery } from '../../ui/hooks';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toast';
import { integrationFromEntry } from '../plans/planProgress';

const MAX_IMAGE_MB = 8;

export function blankEntry(): JournalEntry {
  const now = Date.now();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    date: new Date().toISOString().slice(0, 10),
    locationName: '',
    latDeg: null,
    lonDeg: null,
    targetId: null,
    targetName: '',
    cameraName: '',
    opticsName: '',
    focalLengthMm: null,
    fNumber: null,
    exposureMode: 'tracking',
    filterName: '',
    isoGain: '',
    subExposureS: null,
    lightCount: null,
    totalIntegrationS: null,
    darks: null,
    flats: null,
    bias: null,
    darkFlats: null,
    bortle: null,
    sqm: null,
    weather: null,
    rating: null,
    notes: '',
    trailing: null,
    imageId: null,
    planId: null,
    useForMountCalibration: false,
    mountId: null,
  };
}

function ImageThumb({ id }: { id: string }) {
  const img = useLiveQuery(() => userDb().journalImages.get(id), [id], undefined);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!img) return;
    const u = URL.createObjectURL(img.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [img]);
  return url ? (
    <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8 }} />
  ) : null;
}

function Editor({ initial, onClose }: { initial: JournalEntry; onClose: () => void }) {
  const { t } = useI18n();
  const app = useApp();
  const toast = useToast();
  const [e, setE] = useState<JournalEntry>(initial);
  const plans = useLiveQuery(() => userDb().plans.toArray(), [], []);
  const set = <K extends keyof JournalEntry>(k: K, v: JournalEntry[K]) =>
    setE((x) => ({ ...x, [k]: v }));
  const hour = app.weather.hourly?.find((h) => Math.abs(h.timeMs - Date.now()) < 1800_000) ?? null;
  const save = async () => {
    const entry = {
      ...e,
      updatedAt: Date.now(),
      totalIntegrationS:
        e.totalIntegrationS ??
        (e.subExposureS && e.lightCount ? e.subExposureS * e.lightCount : null),
    };
    await userDb().journal.put(entry);
    // Explicit opt-in only: record a mount calibration point from this session.
    if (
      entry.useForMountCalibration &&
      !initial.useForMountCalibration &&
      entry.mountId &&
      entry.focalLengthMm &&
      entry.subExposureS &&
      entry.trailing === 'round'
    ) {
      const m = await userDb().mounts.get(entry.mountId);
      if (m) {
        await userDb().mounts.update(m.id, {
          calibration: [
            ...m.calibration,
            {
              focalLengthMm: Math.round(entry.focalLengthMm),
              reliableExposureS: entry.subExposureS,
              source: 'journal',
            },
          ],
          updatedAt: Date.now(),
        });
        toast(t('journal.calibrationAdded'));
      }
    }
    toast(t('common.saved'));
    onClose();
  };
  const num = (k: keyof JournalEntry, label: TKey, step: number | 'any' = 'any') => (
    <Field label={t(label)}>
      {(id) => (
        <NumberInput
          id={id}
          step={step}
          value={e[k] as number | null}
          onChange={(v) => set(k, v as never)}
        />
      )}
    </Field>
  );
  return (
    <Modal
      title={
        initial.createdAt === initial.updatedAt && !initial.targetName
          ? t('journal.new')
          : t('journal.edit')
      }
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn primary" onClick={() => void save()}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('journal.date')}>
          {(id) => (
            <input
              id={id}
              type="date"
              value={e.date}
              onChange={(x) => set('date', x.target.value)}
            />
          )}
        </Field>
        <Field label={t('journal.target')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={e.targetName}
              onChange={(x) => set('targetName', x.target.value)}
            />
          )}
        </Field>
        <Field label={t('journal.location')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={e.locationName}
              onChange={(x) => set('locationName', x.target.value)}
            />
          )}
        </Field>
        <Field label={t('journal.camera')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={e.cameraName}
              onChange={(x) => set('cameraName', x.target.value)}
            />
          )}
        </Field>
        <Field label={t('journal.optics')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={e.opticsName}
              onChange={(x) => set('opticsName', x.target.value)}
            />
          )}
        </Field>
        {num('focalLengthMm', 'journal.focal')}
        {num('fNumber', 'journal.fNumber')}
        <div className="field">
          <span className="label">{t('journal.mode')}</span>
          <Segmented
            label={t('journal.mode')}
            value={e.exposureMode}
            onChange={(v) => set('exposureMode', v)}
            options={[
              { value: 'tracking', label: t('controls.tracking') },
              { value: 'fixed', label: t('controls.fixed') },
            ]}
          />
        </div>
        <Field label={t('journal.filter')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={e.filterName}
              onChange={(x) => set('filterName', x.target.value)}
            />
          )}
        </Field>
        <Field label={t('journal.isoGain')}>
          {(id) => (
            <input
              id={id}
              type="text"
              value={e.isoGain}
              onChange={(x) => set('isoGain', x.target.value)}
            />
          )}
        </Field>
        {num('subExposureS', 'journal.sub')}
        {num('lightCount', 'journal.lights', 1)}
        {num('darks', 'journal.darks', 1)}
        {num('flats', 'journal.flats', 1)}
        {num('bias', 'journal.bias', 1)}
        {num('darkFlats', 'journal.darkFlats', 1)}
        {num('bortle', 'journal.bortle', 1)}
        {num('sqm', 'journal.sqm')}
        <div className="field">
          <span className="label">{t('journal.trailing')}</span>
          <Segmented<StarShape | 'none'>
            label={t('journal.trailing')}
            value={e.trailing ?? 'none'}
            onChange={(v) => set('trailing', v === 'none' ? null : v)}
            options={[
              { value: 'none', label: '—' },
              { value: 'round', label: t('recipe.starShape.round') },
              { value: 'mild', label: t('recipe.starShape.mild') },
              { value: 'obvious', label: t('recipe.starShape.obvious') },
            ]}
          />
        </div>
        <div className="field">
          <span className="label">{t('journal.rating')}</span>
          <div className="row" role="radiogroup" aria-label={t('journal.rating')}>
            {[1, 2, 3, 4, 5].map((r) => (
              <button
                key={r}
                type="button"
                className="chip"
                role="radio"
                aria-checked={e.rating === r}
                aria-pressed={e.rating === r}
                onClick={() => set('rating', e.rating === r ? null : r)}
              >
                {'★'.repeat(r)}
              </button>
            ))}
          </div>
          <span className="hint">{t('journal.ratingNote')}</span>
        </div>
        <Field label={t('journal.plan')}>
          {(id) => (
            <select
              id={id}
              value={e.planId ?? ''}
              onChange={(x) => set('planId', x.target.value || null)}
            >
              <option value="">—</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('equipment.rig.mount')}>
          {(id) => (
            <select
              id={id}
              value={e.mountId ?? ''}
              onChange={(x) => set('mountId', x.target.value || null)}
            >
              <option value="">—</option>
              {app.equipment.mounts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="full">
          <Checkbox
            checked={e.useForMountCalibration}
            onChange={(v) => set('useForMountCalibration', v)}
          >
            {t('journal.useForCalibration')}
          </Checkbox>
          <p className="tiny faint">{t('journal.useForCalibrationHint')}</p>
        </div>
        <Field label={t('journal.notes')} className="full">
          {(id) => (
            <textarea id={id} value={e.notes} onChange={(x) => set('notes', x.target.value)} />
          )}
        </Field>
        <div className="full stack">
          <span className="small muted">{t('journal.weather')}</span>
          {e.weather ? (
            <span className="small">
              {e.weather.score != null ? `${Math.round(e.weather.score)} · ` : ''}
              {e.weather.cloudPct != null ? `☁ ${Math.round(e.weather.cloudPct)}% · ` : ''}
              {e.weather.windKmh != null ? `${Math.round(e.weather.windKmh)} km/h` : ''}
            </span>
          ) : (
            hour && (
              <button
                type="button"
                className="btn small"
                onClick={() =>
                  set('weather', {
                    capturedAt: Date.now(),
                    score: hour.score,
                    cloudPct: hour.ceff,
                    temperatureC: null,
                    humidityPct: null,
                    windKmh: hour.windEff,
                  })
                }
              >
                {t('journal.captureWeather')}
              </button>
            )
          )}
        </div>
        <div className="full stack">
          <span className="small muted">{t('journal.image')}</span>
          {e.imageId && <ImageThumb id={e.imageId} />}
          <div className="row">
            <label className="btn small">
              <Icon name="upload" /> {t('journal.attachImage')}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (x) => {
                  const f = x.target.files?.[0];
                  x.target.value = '';
                  if (!f) return;
                  if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
                    toast(t('journal.imageTooLarge', { mb: MAX_IMAGE_MB }));
                    return;
                  }
                  const id = newId();
                  await userDb().journalImages.put({
                    id,
                    blob: f,
                    mime: f.type,
                    size: f.size,
                    createdAt: Date.now(),
                  });
                  if (e.imageId) await userDb().journalImages.delete(e.imageId);
                  set('imageId', id);
                }}
              />
            </label>
            {e.imageId && (
              <button
                type="button"
                className="btn small danger"
                onClick={async () => {
                  await userDb().journalImages.delete(e.imageId!);
                  set('imageId', null);
                }}
              >
                {t('journal.removeImage')}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function JournalPage() {
  const { t, fmtDuration } = useI18n();
  const app = useApp();
  const entries = useLiveQuery(() => userDb().journal.orderBy('date').reverse().toArray(), [], []);
  const [newParam, setNewParam] = useQueryParam('new');
  const [editParam, setEditParam] = useQueryParam('edit');
  const [targetParam] = useQueryParam('target');
  const [planParam] = useQueryParam('plan');
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  useEffect(() => {
    if (editParam) {
      void userDb()
        .journal.get(editParam)
        .then((e) => e && setEditing(e));
    }
  }, [editParam]);
  useEffect(() => {
    if (!newParam) return;
    const base = blankEntry();
    const cam = app.equipment.cameras.find((c) => c.id === app.rig?.cameraId);
    base.locationName = app.location?.name ?? '';
    base.latDeg = app.location?.latDeg ?? null;
    base.lonDeg = app.location?.lonDeg ?? null;
    base.cameraName = cam?.name ?? '';
    base.exposureMode = app.settings.exposureMode;
    base.bortle = app.sky.source === 'assumed' ? null : app.sky.bortle;
    base.mountId = app.rig?.mountId ?? null;
    base.planId = planParam;
    if (targetParam && app.catalogue.ready) {
      void catalogApi()
        .summaries([targetParam])
        .then(([s]) =>
          setEditing({
            ...base,
            targetId: targetParam,
            targetName: s ? s.name + (s.commonName ? ` (${s.commonName})` : '') : targetParam,
          }),
        );
    } else setEditing(base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newParam, app.catalogue.ready]);

  const totalH = entries.reduce((s, e) => s + integrationFromEntry(e), 0) / 3600;
  const close = () => {
    setEditing(null);
    if (newParam) setNewParam(null);
    if (editParam) setEditParam(null);
  };
  return (
    <div>
      <div className="page-header">
        <h1>{t('journal.title')}</h1>
        <p>{t('journal.subtitle')}</p>
      </div>
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button type="button" className="btn primary" onClick={() => setNewParam('1')}>
          <Icon name="plus" /> {t('journal.new')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={entries.length === 0}
          onClick={() =>
            downloadText(
              `astrotrack-journal-${new Date().toISOString().slice(0, 10)}.csv`,
              journalToCsv(entries),
              'text/csv',
            )
          }
        >
          <Icon name="download" /> {t('journal.exportCsv')}
        </button>
      </div>
      <section className="card">
        {entries.length === 0 ? (
          <EmptyState>{t('journal.none')}</EmptyState>
        ) : (
          <>
            <p className="small muted">
              {t('journal.stats', { count: entries.length, hours: fmtDuration(totalH) })}
            </p>
            <ul className="list">
              {entries.map((e) => (
                <li key={e.id} className="list-item">
                  <div className="body">
                    <div className="title">
                      {e.date} · {e.targetName || '—'}
                    </div>
                    <div className="sub">
                      {[
                        e.locationName,
                        e.opticsName,
                        e.focalLengthMm ? `${e.focalLengthMm} mm` : '',
                        e.lightCount && e.subExposureS ? `${e.lightCount}×${e.subExposureS}s` : '',
                        fmtDuration(integrationFromEntry(e) / 3600),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {e.rating && <div className="tiny">{'★'.repeat(e.rating)}</div>}
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    aria-label={t('common.edit')}
                    onClick={() => setEditing(e)}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    aria-label={t('common.delete')}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          t('common.confirmDelete', { name: `${e.date} ${e.targetName}` }),
                        )
                      )
                        return;
                      if (e.imageId) await userDb().journalImages.delete(e.imageId);
                      await userDb().journal.delete(e.id);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {editing && <Editor initial={editing} onClose={close} />}
    </div>
  );
}
