import { useState } from 'react';
import { useApp } from '../../app/AppState';
import { createSampleEquipment } from '../../app/rig';
import { cropFactor } from '../../astro/equipment';
import { derivePixelPitchUm } from '../../astro/pixelScale';
import { deleteEquipment, isCameraInUse, repos, saveEntity } from '../../db/repo';
import type {
  CameraProfile,
  FilterProfile,
  MountProfile,
  OpticsProfile,
  RigProfile,
} from '../../db/types';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { EmptyState, Tabs } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/toast';
import { sampleNames } from '../common/sampleNames';
import { CameraForm, FilterForm, MountForm, OpticsForm, RigForm } from './forms';

type Tab = 'rigs' | 'cameras' | 'optics' | 'mounts' | 'filters';

export function EquipmentPage() {
  const { t, fmtNumber } = useI18n();
  const app = useApp();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('rigs');
  const [editing, setEditing] = useState<{ tab: Tab; item: unknown | null } | null>(null);
  const eq = app.equipment;

  const confirmDelete = (name: string) => window.confirm(t('common.confirmDelete', { name }));

  const row = (
    key: string,
    title: string,
    sub: string,
    onEdit: () => void,
    onDelete: () => void,
    extra?: React.ReactNode,
  ) => (
    <li key={key} className="list-item">
      <div className="body">
        <div className="title">{title}</div>
        <div className="sub">{sub}</div>
        {extra}
      </div>
      <button
        type="button"
        className="btn small"
        onClick={onEdit}
        aria-label={`${t('common.edit')} ${title}`}
      >
        <Icon name="edit" />
      </button>
      <button
        type="button"
        className="btn small danger"
        onClick={onDelete}
        aria-label={`${t('common.delete')} ${title}`}
      >
        <Icon name="trash" />
      </button>
    </li>
  );

  const opticsSub = (o: OpticsProfile) => {
    const fl = o.focalLengthMaxMm
      ? `${o.focalLengthMm}–${o.focalLengthMaxMm} mm`
      : `${o.focalLengthMm} mm`;
    const f = o.fNumber
      ? o.fNumberAtMax
        ? `f/${o.fNumber}–${o.fNumberAtMax}`
        : `f/${o.fNumber}`
      : o.apertureMm
        ? `Ø${o.apertureMm} mm`
        : '';
    return [t(`opticsKind.${o.kind}` as TKey), fl, f, o.multiplier ? `×${o.multiplier}` : '']
      .filter(Boolean)
      .join(' · ');
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('equipment.title')}</h1>
        <p>{t('equipment.subtitle')}</p>
      </div>
      <Tabs<Tab>
        label={t('equipment.title')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rigs', label: t('equipment.rigs') },
          { value: 'cameras', label: t('equipment.cameras') },
          { value: 'optics', label: t('equipment.opticsTab') },
          { value: 'mounts', label: t('equipment.mounts') },
          { value: 'filters', label: t('equipment.filters') },
        ]}
      />
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button
          type="button"
          className="btn primary"
          onClick={() => setEditing({ tab, item: null })}
        >
          <Icon name="plus" />
          {t(
            (
              {
                rigs: 'equipment.newRig',
                cameras: 'equipment.newCamera',
                optics: 'equipment.newOptics',
                mounts: 'equipment.newMount',
                filters: 'equipment.newFilter',
              } as const
            )[tab],
          )}
        </button>
        {tab === 'rigs' && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await createSampleEquipment({
                ...sampleNames(t),
              });
              toast(t('equipment.sampleLoaded'));
            }}
          >
            {t('tonight.sampleEquipment')}
          </button>
        )}
      </div>
      <section className="card">
        {tab === 'rigs' &&
          (app.rigs.length === 0 ? (
            <EmptyState>{t('equipment.noneYet')}</EmptyState>
          ) : (
            <ul className="list">
              {app.rigs.map((r) => {
                const cam = eq.cameras.find((c) => c.id === r.cameraId);
                const opt = r.opticsIds
                  .map((id) => eq.optics.find((o) => o.id === id)?.name)
                  .filter(Boolean);
                const mount = eq.mounts.find((m) => m.id === r.mountId);
                return row(
                  r.id,
                  r.name,
                  [cam?.name, opt.join(', '), mount?.name ?? t('equipment.rig.noMount')]
                    .filter(Boolean)
                    .join(' · '),
                  () => setEditing({ tab: 'rigs', item: r }),
                  async () => {
                    if (confirmDelete(r.name)) await repos.rigs().delete(r.id);
                  },
                  <div className="row" style={{ marginTop: 4 }}>
                    {app.rig?.id === r.id ? (
                      <span className="badge good">{t('common.active')}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void app.update({ activeRigId: r.id })}
                      >
                        {t('common.setActive')}
                      </button>
                    )}
                  </div>,
                );
              })}
            </ul>
          ))}
        {tab === 'cameras' &&
          (eq.cameras.length === 0 ? (
            <EmptyState>{t('equipment.noneYet')}</EmptyState>
          ) : (
            <ul className="list">
              {eq.cameras.map((c) => {
                const pitch =
                  c.pixelPitchUm ??
                  derivePixelPitchUm(
                    c.sensorWidthMm,
                    c.sensorHeightMm,
                    c.resolutionX,
                    c.resolutionY,
                  ).pitchUm;
                return row(
                  c.id,
                  c.name,
                  `${c.sensorWidthMm}×${c.sensorHeightMm} mm · ${c.resolutionX}×${c.resolutionY} · ${fmtNumber(pitch, 2)} µm · ${t(`cameraKind.${c.kind}` as TKey)} · ${t(`modification.${c.modification}` as TKey)} · ${t('equipment.camera.crop', { crop: fmtNumber(cropFactor(c), 2) })}`,
                  () => setEditing({ tab: 'cameras', item: c }),
                  async () => {
                    if (await isCameraInUse(c.id)) {
                      toast(t('equipment.inUse'));
                      return;
                    }
                    if (confirmDelete(c.name)) await repos.cameras().delete(c.id);
                  },
                );
              })}
            </ul>
          ))}
        {tab === 'optics' &&
          (eq.optics.length === 0 ? (
            <EmptyState>{t('equipment.noneYet')}</EmptyState>
          ) : (
            <ul className="list">
              {eq.optics.map((o) =>
                row(
                  o.id,
                  o.name,
                  opticsSub(o),
                  () => setEditing({ tab: 'optics', item: o }),
                  async () => {
                    if (confirmDelete(o.name)) await deleteEquipment('optics', o.id);
                  },
                ),
              )}
            </ul>
          ))}
        {tab === 'mounts' &&
          (eq.mounts.length === 0 ? (
            <EmptyState>{t('equipment.noneYet')}</EmptyState>
          ) : (
            <ul className="list">
              {eq.mounts.map((m) =>
                row(
                  m.id,
                  m.name,
                  [
                    m.tracking ? t('equipment.mount.tracking') : t('controls.fixed'),
                    m.equatorial ? t('equipment.mount.equatorial') : '',
                    m.guiding ? t('equipment.mount.guiding') : '',
                    m.calibration.length
                      ? `${t('equipment.mount.calibration')}: ${m.calibration.length}`
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  () => setEditing({ tab: 'mounts', item: m }),
                  async () => {
                    if (confirmDelete(m.name)) await deleteEquipment('mounts', m.id);
                  },
                ),
              )}
            </ul>
          ))}
        {tab === 'filters' &&
          (eq.filters.length === 0 ? (
            <EmptyState>{t('equipment.noneYet')}</EmptyState>
          ) : (
            <ul className="list">
              {eq.filters.map((f) =>
                row(
                  f.id,
                  f.name,
                  [
                    t(`filterKind.${f.kind}` as TKey),
                    ...f.bands.map((b) => `${b.centerNm}/${b.bandwidthNm} nm`),
                  ].join(' · '),
                  () => setEditing({ tab: 'filters', item: f }),
                  async () => {
                    if (confirmDelete(f.name)) await deleteEquipment('filters', f.id);
                  },
                ),
              )}
            </ul>
          ))}
      </section>
      {editing?.tab === 'cameras' && (
        <CameraForm
          initial={editing.item as CameraProfile | null}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            await saveEntity(repos.cameras(), c);
            setEditing(null);
            toast(t('common.saved'));
          }}
        />
      )}
      {editing?.tab === 'optics' && (
        <OpticsForm
          initial={editing.item as OpticsProfile | null}
          onClose={() => setEditing(null)}
          onSave={async (o) => {
            await saveEntity(repos.optics(), o);
            setEditing(null);
            toast(t('common.saved'));
          }}
        />
      )}
      {editing?.tab === 'mounts' && (
        <MountForm
          initial={editing.item as MountProfile | null}
          onClose={() => setEditing(null)}
          onSave={async (m) => {
            await saveEntity(repos.mounts(), m);
            setEditing(null);
            toast(t('common.saved'));
          }}
        />
      )}
      {editing?.tab === 'filters' && (
        <FilterForm
          initial={editing.item as FilterProfile | null}
          onClose={() => setEditing(null)}
          onSave={async (f) => {
            await saveEntity(repos.filters(), f);
            setEditing(null);
            toast(t('common.saved'));
          }}
        />
      )}
      {editing?.tab === 'rigs' && (
        <RigForm
          initial={editing.item as RigProfile | null}
          equipment={eq}
          onClose={() => setEditing(null)}
          onSave={async (r) => {
            const saved = await saveEntity(repos.rigs(), r);
            if (!app.rig) await app.update({ activeRigId: saved.id });
            setEditing(null);
            toast(t('common.saved'));
          }}
        />
      )}
    </div>
  );
}
