import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n/i18n';
import type { TKey } from '../i18n/i18n';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/Icon';
import { useOnline } from '../ui/hooks';
import { useApp } from './AppState';
import { Link, navigate, useLocationPath } from './router';
import type { ThemeName } from '../db/types';

interface NavItem {
  to: string;
  label: TKey;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { to: '/tonight', label: 'nav.tonight', icon: 'moon' },
  { to: '/now', label: 'nav.now', icon: 'clock' },
  { to: '/explore', label: 'nav.explore', icon: 'search' },
  { to: '/events', label: 'nav.events', icon: 'sparkle' },
  { to: '/plans', label: 'nav.plans', icon: 'calendar' },
  { to: '/session', label: 'nav.session', icon: 'target' },
  { to: '/journal', label: 'nav.journal', icon: 'book' },
  { to: '/equipment', label: 'nav.equipment', icon: 'camera' },
  { to: '/locations', label: 'nav.locations', icon: 'pin' },
  { to: '/offline', label: 'nav.offline', icon: 'download' },
  { to: '/settings', label: 'nav.settings', icon: 'gear' },
  { to: '/licenses', label: 'nav.licenses', icon: 'info' },
];
const PRIMARY = ['/tonight', '/now', '/explore', '/session'];

const THEME_ORDER: ThemeName[] = ['dark', 'night', 'light'];

export function useApplyTheme() {
  const { settings } = useApp();
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute(
      'content',
      settings.theme === 'light' ? '#f5f7fb' : settings.theme === 'night' ? '#000000' : '#0b1020',
    );
  }, [settings.theme]);
}

function isActive(path: string, to: string) {
  return path === to || (to !== '/' && path.startsWith(to + '/'));
}

export function AppShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  const { t } = useI18n();
  const { path } = useLocationPath();
  const app = useApp();
  const online = useOnline();
  const [moreOpen, setMoreOpen] = useState(false);
  useApplyTheme();
  useEffect(() => setMoreOpen(false), [path]);
  const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(app.settings.theme) + 1) % THEME_ORDER.length];

  return (
    <div className="app">
      <a className="visually-hidden" href="#main">
        {t('app.skipToContent')}
      </a>
      <header className="topbar">
        <Link to="/tonight" className="brand">
          {t('app.name')}
        </Link>
        {!online && <span className="badge warn">{t('app.offline')}</span>}
        <div className="spacer" />
        <div className="chips">
          <select
            aria-label={t('nav.locations')}
            value={app.location?.id ?? ''}
            onChange={(e) => {
              if (e.target.value === '__new') navigate('/locations');
              else void app.update({ activeLocationId: e.target.value });
            }}
            style={{ maxWidth: 150, minHeight: 34, padding: '0.2rem 0.4rem', fontSize: 14 }}
          >
            {app.locations.length === 0 && <option value="">{t('app.noLocation')}</option>}
            {app.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
            <option value="__new">+ {t('locations.new')}</option>
          </select>
          <select
            aria-label={t('nav.equipment')}
            value={app.rig?.id ?? ''}
            onChange={(e) => {
              if (e.target.value === '__new') navigate('/equipment');
              else void app.update({ activeRigId: e.target.value });
            }}
            style={{ maxWidth: 150, minHeight: 34, padding: '0.2rem 0.4rem', fontSize: 14 }}
          >
            {app.rigs.length === 0 && <option value="">{t('app.noRig')}</option>}
            {app.rigs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
            <option value="__new">+ {t('equipment.newRig')}</option>
          </select>
        </div>
        <button
          type="button"
          className="btn icon ghost"
          onClick={() => void app.update({ theme: nextTheme })}
          aria-label={`${t('theme.label')}: ${t(`theme.${app.settings.theme}` as TKey)} → ${t(`theme.${nextTheme}` as TKey)}`}
          title={t(`theme.${nextTheme}` as TKey)}
        >
          <Icon
            name={
              app.settings.theme === 'light'
                ? 'sun'
                : app.settings.theme === 'night'
                  ? 'eye'
                  : 'moon'
            }
          />
        </button>
      </header>
      {banner}
      <div className="layout">
        <nav className="sidenav" aria-label={t('nav.main')}>
          {NAV.map((n, i) => (
            <span key={n.to} style={{ display: 'contents' }}>
              {(i === 7 || i === 10) && <span className="sep" />}
              <Link to={n.to} aria-current={isActive(path, n.to) ? 'page' : undefined}>
                <Icon name={n.icon} />
                {t(n.label)}
              </Link>
            </span>
          ))}
        </nav>
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <nav className="bottomnav" aria-label={t('nav.main')}>
        {NAV.filter((n) => PRIMARY.includes(n.to)).map((n) => (
          <Link key={n.to} to={n.to} aria-current={isActive(path, n.to) ? 'page' : undefined}>
            <Icon name={n.icon} />
            {t(n.label)}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <Icon name="more" />
          {t('nav.more')}
        </button>
      </nav>
      {moreOpen && (
        <div
          className="more-menu"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.more')}
          onClick={(e) => e.target === e.currentTarget && setMoreOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setMoreOpen(false)}
        >
          <div className="sheet">
            {NAV.filter((n) => !PRIMARY.includes(n.to)).map((n) => (
              <Link key={n.to} to={n.to} aria-current={isActive(path, n.to) ? 'page' : undefined}>
                <Icon name={n.icon} />
                {t(n.label)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
