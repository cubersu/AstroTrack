import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import { reloadCatalogue } from '../../app/catalogClient';
import { dataDb } from '../../data/dataDb';
import type { PackStatus } from '../../data/packs';
import {
  computePackStatuses,
  getDataBaseUrl,
  installPack,
  listPackStates,
  loadBundledRegistry,
  loadRemoteRegistry,
  removePack,
} from '../../data/packs';
import type { PackRegistry } from '../../data/packTypes';
import { clearPreviewCache } from '../../data/previews';
import { useI18n } from '../../i18n/i18n';
import { Spinner } from '../../ui/controls';
import { useLiveQuery, useOnline } from '../../ui/hooks';
import { useToast } from '../../ui/toast';
import { clearWeatherCache } from '../../weather/weatherService';

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KiB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 ** 3).toFixed(2)} GiB`;
}

export function OfflinePage() {
  const { t, fmtDate } = useI18n();
  const app = useApp();
  const toast = useToast();
  const online = useOnline();
  const [bundled, setBundled] = useState<PackRegistry | null>(null);
  const [remote, setRemote] = useState<PackRegistry | null>(null);
  const [statuses, setStatuses] = useState<PackStatus[]>([]);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [storage, setStorage] = useState<{
    used: number;
    quota: number;
    persisted: boolean;
  } | null>(null);
  const weatherCount = useLiveQuery(() => dataDb().weatherCache.count(), [], 0);
  const previewCount = useLiveQuery(() => dataDb().previewCache.count(), [], 0);
  const source = app.settings.dataSourceUrl || getDataBaseUrl();

  const refresh = useCallback(async () => {
    const b = bundled ?? (await loadBundledRegistry().catch(() => null));
    if (!bundled && b) setBundled(b);
    setStatuses(computePackStatuses(b, await listPackStates(), remote));
  }, [bundled, remote]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    (async () => {
      if (!navigator.storage?.estimate) return;
      const est = await navigator.storage.estimate();
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0, persisted });
    })();
  }, [statuses]);

  const check = async () => {
    setChecking(true);
    try {
      setRemote(await loadRemoteRegistry(source));
    } catch (e) {
      toast(t('common.error', { error: (e as Error).message }));
    } finally {
      setChecking(false);
    }
  };

  const install = async (id: string) => {
    const manifest =
      remote?.packs.find((p) => p.id === id) ?? bundled?.packs.find((p) => p.id === id);
    if (!manifest) return;
    setBusy((b) => ({ ...b, [id]: 0 }));
    try {
      await installPack(manifest, remote ? source : getDataBaseUrl(), (p) =>
        setBusy((b) => ({ ...b, [id]: p.loadedBytes / Math.max(1, p.totalBytes) })),
      );
      toast(t('offline.installed_ok', { title: manifest.title }));
      if (
        manifest.kind === 'dso-catalogue' ||
        manifest.kind === 'star-tiles' ||
        manifest.kind === 'star-catalogue'
      )
        await reloadCatalogue();
    } catch (e) {
      toast(t('offline.installFailed', { error: (e as Error).message }));
    } finally {
      setBusy((b) => {
        const n = { ...b };
        delete n[id];
        return n;
      });
      await refresh();
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('offline.title')}</h1>
        <p>{t('offline.subtitle')}</p>
      </div>
      <section className="card">
        <div className="row between">
          <h2>{t('offline.packs')}</h2>
          <button
            type="button"
            className="btn"
            onClick={() => void check()}
            disabled={!online || checking}
          >
            {checking ? t('offline.checking') : t('offline.checkUpdates')}
          </button>
        </div>
        {!online && <p className="small muted">{t('offline.offlineNote')}</p>}
        <p className="tiny faint">
          {t('offline.source')}: {app.settings.dataSourceUrl || t('offline.sourceDefault')}
        </p>
        <ul className="list">
          {statuses.map((s) => (
            <li key={s.id} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="body">
                <div className="title">
                  {s.title}{' '}
                  {s.optional && <span className="badge neutral">{t('offline.optional')}</span>}
                </div>
                <div className="sub">
                  {s.activeSource === 'installed'
                    ? `${t('offline.installed')} · ${s.installedVersion}`
                    : s.activeSource === 'bundled'
                      ? `${t('offline.bundled')} · ${s.bundledVersion}`
                      : t('offline.notInstalled')}
                  {' · '}
                  {fmtBytes(s.sizeBytes)}
                  {s.records != null && ` · ${t('offline.records', { count: s.records })}`}
                </div>
                {s.installedAt && (
                  <div className="tiny muted">
                    {t('offline.installedAt', { date: fmtDate(s.installedAt) })}
                  </div>
                )}
                {s.latestVersion && (
                  <div className="tiny">
                    {t('offline.latest')}: {s.latestVersion} —{' '}
                    {s.updateAvailable ? (
                      <span style={{ color: 'var(--warn)' }}>
                        {t('offline.updateAvailable', { version: s.latestVersion })}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--good)' }}>{t('offline.upToDate')}</span>
                    )}
                  </div>
                )}
                <div className="tiny faint">
                  {s.license} · {s.attribution}
                </div>
                {busy[s.id] !== undefined && (
                  <div
                    className="bar"
                    style={{ marginTop: 4 }}
                    aria-label={t('offline.downloading', { pct: Math.round(busy[s.id] * 100) })}
                  >
                    <span style={{ width: `${Math.round(busy[s.id] * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="stack">
                {s.activeSource === 'none' && (
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={!online || busy[s.id] !== undefined}
                    onClick={() => void install(s.id)}
                  >
                    {t('offline.install')}
                  </button>
                )}
                {s.updateAvailable && (
                  <button
                    type="button"
                    className="btn small primary"
                    disabled={!online || busy[s.id] !== undefined}
                    onClick={() => void install(s.id)}
                  >
                    {t('offline.update')}
                  </button>
                )}
                {s.activeSource === 'installed' && (
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={async () => {
                      await removePack(s.id);
                      await reloadCatalogue();
                      await refresh();
                    }}
                  >
                    {s.bundled ? t('offline.revert') : t('offline.remove')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="tiny faint">{t('offline.integrity')}</p>
      </section>
      <section className="card">
        <h2>{t('offline.lpTitle')}</h2>
        {statuses.some((s) => s.kind === 'light-pollution') ? null : (
          <p className="small muted">{t('offline.lpNone')}</p>
        )}
      </section>
      <section className="card">
        <h2>{t('offline.caches')}</h2>
        <ul className="list">
          <li className="list-item">
            <div className="body">
              <div className="title">{t('offline.weatherCache')}</div>
              <div className="sub">{t('offline.items', { count: weatherCount })}</div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                await clearWeatherCache();
                toast(t('offline.cleared'));
              }}
            >
              {t('offline.clearCache')}
            </button>
          </li>
          <li className="list-item">
            <div className="body">
              <div className="title">{t('offline.previewCache')}</div>
              <div className="sub">{t('offline.items', { count: previewCount })}</div>
            </div>
            <button
              type="button"
              className="btn small"
              onClick={async () => {
                await clearPreviewCache();
                toast(t('offline.cleared'));
              }}
            >
              {t('offline.clearCache')}
            </button>
          </li>
        </ul>
      </section>
      <section className="card">
        <h2>{t('offline.storage')}</h2>
        {!storage ? (
          <Spinner label={t('common.loading')} />
        ) : (
          <>
            <p className="small">
              {t('offline.storageUsage', {
                used: fmtBytes(storage.used),
                quota: fmtBytes(storage.quota),
              })}
            </p>
            <p className="small muted">
              {storage.persisted ? t('offline.persisted') : t('offline.notPersisted')}
            </p>
            {!storage.persisted && navigator.storage?.persist && (
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  const ok = await navigator.storage.persist();
                  setStorage((s) => (s ? { ...s, persisted: ok } : s));
                }}
              >
                {t('offline.persist')}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
