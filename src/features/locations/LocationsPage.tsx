import { useEffect, useMemo, useState } from 'react';
import { locationSky, useApp } from '../../app/AppState';
import { useQueryParam } from '../../app/router';
import { sqmToBortle } from '../../astro/lightPollution';
import { estimateAtlasSqm } from '../../data/lightPollutionPacks';
import type { AtlasEstimate } from '../../data/lightPollutionPacks';
import { repos, saveEntity } from '../../db/repo';
import type { ObservingLocation } from '../../db/types';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { EmptyState, Field, Modal, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toast';

type Draft = Omit<ObservingLocation, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
};

export function validateLocation(d: Draft): Partial<Record<keyof Draft, TKey>> {
  const e: Partial<Record<keyof Draft, TKey>> = {};
  if (!d.name.trim()) e.name = 'common.required';
  if (!Number.isFinite(d.latDeg) || d.latDeg < -90 || d.latDeg > 90)
    e.latDeg = 'locations.invalidLat';
  if (!Number.isFinite(d.lonDeg) || d.lonDeg < -180 || d.lonDeg > 180)
    e.lonDeg = 'locations.invalidLon';
  if (d.bortleManual != null && (d.bortleManual < 1 || d.bortleManual > 9))
    e.bortleManual = 'common.invalidNumber';
  if (d.sqmManual != null && (d.sqmManual < 15 || d.sqmManual > 23))
    e.sqmManual = 'common.invalidNumber';
  return e;
}

function timeZones(): string[] {
  try {
    return (
      (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.(
        'timeZone',
      ) ?? []
    );
  } catch {
    return [];
  }
}

function LocationForm({
  initial,
  onClose,
  onSave,
}: {
  initial: ObservingLocation | null;
  onClose: () => void;
  onSave: (d: Draft) => Promise<void>;
}) {
  const { t, fmtNumber, td } = useI18n();
  const [d, setD] = useState<Draft>(
    initial ?? {
      name: '',
      latDeg: Number.NaN,
      lonDeg: Number.NaN,
      elevationM: null,
      timeZone: null,
      bortleManual: null,
      sqmManual: null,
      atlasSqm: null,
      notes: '',
    },
  );
  const [touched, setTouched] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [atlas, setAtlas] = useState<AtlasEstimate | null | undefined>(undefined);
  const errors = validateLocation(d);
  const err = (k: keyof Draft) => (touched && errors[k] ? t(errors[k]!) : undefined);
  const zones = useMemo(timeZones, []);
  useEffect(() => {
    if (!Number.isFinite(d.latDeg) || !Number.isFinite(d.lonDeg)) return;
    let alive = true;
    estimateAtlasSqm(d.latDeg, d.lonDeg).then(
      (a) => alive && setAtlas(a),
      () => alive && setAtlas(null),
    );
    return () => {
      alive = false;
    };
  }, [d.latDeg, d.lonDeg]);
  const eff = locationSky({ ...(d as ObservingLocation), atlasSqm: atlas?.sqm ?? null });
  return (
    <Modal
      title={initial ? t('common.edit') : t('locations.new')}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setTouched(true);
              if (Object.keys(errors).length === 0)
                void onSave({ ...d, atlasSqm: atlas?.sqm ?? null });
            }}
          >
            {t('common.save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('common.name')} error={err('name')} className="full">
          {(id) => (
            <input
              id={id}
              type="text"
              value={d.name}
              onChange={(e) => setD({ ...d, name: e.target.value })}
            />
          )}
        </Field>
        <div className="full row">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setGpsErr(null);
              if (!('geolocation' in navigator)) {
                setGpsErr(t('locations.gpsUnavailable'));
                return;
              }
              navigator.geolocation.getCurrentPosition(
                (p) =>
                  setD((x) => ({
                    ...x,
                    latDeg: Math.round(p.coords.latitude * 1e5) / 1e5,
                    lonDeg: Math.round(p.coords.longitude * 1e5) / 1e5,
                    elevationM:
                      p.coords.altitude != null ? Math.round(p.coords.altitude) : x.elevationM,
                  })),
                (e) => setGpsErr(t('locations.gpsError', { error: e.message })),
                { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
              );
            }}
          >
            <Icon name="pin" /> {t('locations.useGps')}
          </button>
          {gpsErr && (
            <span className="small" style={{ color: 'var(--bad)' }}>
              {gpsErr}
            </span>
          )}
        </div>
        <Field label={t('locations.lat')} error={err('latDeg')}>
          {(id) => (
            <NumberInput
              id={id}
              value={Number.isFinite(d.latDeg) ? d.latDeg : null}
              onChange={(v) => setD({ ...d, latDeg: v ?? Number.NaN })}
            />
          )}
        </Field>
        <Field label={t('locations.lon')} error={err('lonDeg')}>
          {(id) => (
            <NumberInput
              id={id}
              value={Number.isFinite(d.lonDeg) ? d.lonDeg : null}
              onChange={(v) => setD({ ...d, lonDeg: v ?? Number.NaN })}
            />
          )}
        </Field>
        <Field label={t('locations.elevation')}>
          {(id) => (
            <NumberInput
              id={id}
              value={d.elevationM}
              onChange={(v) => setD({ ...d, elevationM: v })}
            />
          )}
        </Field>
        <Field label={t('locations.timeZone')}>
          {(id) => (
            <select
              id={id}
              value={d.timeZone ?? ''}
              onChange={(e) => setD({ ...d, timeZone: e.target.value || null })}
            >
              <option value="">{t('locations.deviceTz')}</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('locations.bortle')} error={err('bortleManual')}>
          {(id) => (
            <select
              id={id}
              value={d.bortleManual ?? ''}
              onChange={(e) =>
                setD({ ...d, bortleManual: e.target.value ? Number(e.target.value) : null })
              }
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('locations.sqm')} error={err('sqmManual')}>
          {(id) => (
            <NumberInput
              id={id}
              value={d.sqmManual}
              min={15}
              max={23}
              step={0.01}
              onChange={(v) => setD({ ...d, sqmManual: v })}
            />
          )}
        </Field>
        <p className="tiny faint full">{t('locations.manualHint')}</p>
        <div className="full small">
          <strong>{t('locations.atlas')}: </strong>
          {atlas ? (
            t('locations.atlasValue', {
              sqm: fmtNumber(atlas.sqm, 2),
              bortle: sqmToBortle(atlas.sqm),
            })
          ) : (
            <span className="muted">{t('locations.atlasNone')}</span>
          )}
        </div>
        <p
          className="small full"
          style={{ color: eff.source === 'assumed' ? 'var(--warn)' : undefined }}
        >
          {t('locations.effective', {
            sqm: fmtNumber(eff.sqm, 2),
            bortle: eff.bortle,
            source: td(`skySource.${eff.source}`),
          })}
        </p>
        <Field label={t('common.notes')} className="full">
          {(id) => (
            <textarea
              id={id}
              value={d.notes}
              onChange={(e) => setD({ ...d, notes: e.target.value })}
            />
          )}
        </Field>
        <p className="tiny faint full">{t('locations.horizonNote')}</p>
      </div>
    </Modal>
  );
}

export function LocationsPage() {
  const { t, fmtNumber, td } = useI18n();
  const app = useApp();
  const toast = useToast();
  const [newParam, setNewParam] = useQueryParam('new');
  const [editing, setEditing] = useState<ObservingLocation | null | 'new'>(newParam ? 'new' : null);
  return (
    <div>
      <div className="page-header">
        <h1>{t('locations.title')}</h1>
        <p>{t('locations.subtitle')}</p>
      </div>
      <button
        type="button"
        className="btn primary"
        onClick={() => setEditing('new')}
        style={{ marginBottom: '0.75rem' }}
      >
        <Icon name="plus" /> {t('locations.new')}
      </button>
      <section className="card">
        {app.locations.length === 0 ? (
          <EmptyState>{t('locations.none')}</EmptyState>
        ) : (
          <ul className="list">
            {app.locations.map((l) => {
              const sky = locationSky(l);
              return (
                <li key={l.id} className="list-item">
                  <div className="body">
                    <div className="title">{l.name}</div>
                    <div className="sub">
                      {fmtNumber(l.latDeg, 4)}°, {fmtNumber(l.lonDeg, 4)}°
                      {l.elevationM != null ? ` · ${l.elevationM} m` : ''}
                      {l.timeZone ? ` · ${l.timeZone}` : ''}
                    </div>
                    <div className="tiny muted">
                      {t('locations.effective', {
                        sqm: fmtNumber(sky.sqm, 2),
                        bortle: sky.bortle,
                        source: td(`skySource.${sky.source}`),
                      })}
                    </div>
                    <div className="row" style={{ marginTop: 4 }}>
                      {app.location?.id === l.id ? (
                        <span className="badge good">{t('locations.active')}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => void app.update({ activeLocationId: l.id })}
                        >
                          {t('common.setActive')}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => setEditing(l)}
                    aria-label={`${t('common.edit')} ${l.name}`}
                  >
                    <Icon name="edit" />
                  </button>
                  <button
                    type="button"
                    className="btn small danger"
                    aria-label={`${t('common.delete')} ${l.name}`}
                    onClick={async () => {
                      if (window.confirm(t('common.confirmDelete', { name: l.name })))
                        await repos.locations().delete(l.id);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {editing && (
        <LocationForm
          initial={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
            if (newParam) setNewParam(null);
          }}
          onSave={async (d) => {
            const saved = await saveEntity(repos.locations(), d);
            if (!app.location || editing === 'new')
              await app.update({ activeLocationId: saved.id });
            setEditing(null);
            if (newParam) setNewParam(null);
            toast(t('common.saved'));
          }}
        />
      )}
    </div>
  );
}
