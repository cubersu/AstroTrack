import { useEffect, useState } from 'react';
import { detectLanguage, I18nProvider, useI18n } from '../i18n/i18n';
import { ToastProvider, useToast } from '../ui/toast';
import { AppShell } from './AppShell';
import { AppStateProvider, useApp } from './AppState';
import { RouterProvider, Routes, navigate } from './router';
import type { RouteDef } from './router';
import { setupPwa } from './pwa';
import { TonightPage } from '../features/tonight/TonightPage';
import { ExplorePage } from '../features/explore/ExplorePage';
import { TargetPage } from '../features/target/TargetPage';
import { EventsPage } from '../features/events/EventsPage';
import { PlansPage } from '../features/plans/PlansPage';
import { PlanDetailPage } from '../features/plans/PlanDetailPage';
import { SessionPage } from '../features/session/SessionPage';
import { JournalPage } from '../features/journal/JournalPage';
import { EquipmentPage } from '../features/equipment/EquipmentPage';
import { LocationsPage } from '../features/locations/LocationsPage';
import { OfflinePage } from '../features/offline/OfflinePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { LicensesPage } from '../features/licenses/LicensesPage';

const routes: RouteDef[] = [
  { path: '/tonight', render: () => <TonightPage mode="tonight" /> },
  { path: '/now', render: () => <TonightPage mode="now" /> },
  { path: '/explore', render: () => <ExplorePage /> },
  { path: '/target/:id', render: (m) => <TargetPage id={m.params.id} /> },
  { path: '/events', render: () => <EventsPage /> },
  { path: '/plans', render: () => <PlansPage /> },
  { path: '/plans/:id', render: (m) => <PlanDetailPage id={m.params.id} /> },
  { path: '/session', render: () => <SessionPage /> },
  { path: '/journal', render: () => <JournalPage /> },
  { path: '/equipment', render: () => <EquipmentPage /> },
  { path: '/locations', render: () => <LocationsPage /> },
  { path: '/offline', render: () => <OfflinePage /> },
  { path: '/settings', render: () => <SettingsPage /> },
  { path: '/licenses', render: () => <LicensesPage /> },
];

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
}

function UpdateBanner() {
  const { t } = useI18n();
  const toast = useToast();
  const [update, setUpdate] = useState<null | (() => void)>(null);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    setupPwa({
      onNeedRefresh: (u) => setUpdate(() => u),
      onOfflineReady: () => toast(t('app.offlineReady')),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!update) return null;
  return (
    <div className="banner" role="status">
      {t('app.updateAvailable')}
      <button type="button" className="btn small primary" onClick={update}>
        {t('app.reload')}
      </button>
    </div>
  );
}

function Localized() {
  const app = useApp();
  const lang = app.settings.language ?? detectLanguage();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <I18nProvider lang={lang} timeZone={app.location?.timeZone ?? undefined}>
      <ToastProvider>
        <AppShell banner={<UpdateBanner />}>
          <Routes routes={routes} fallback={<Redirect to="/tonight" />} />
        </AppShell>
      </ToastProvider>
    </I18nProvider>
  );
}

export function App() {
  return (
    <RouterProvider>
      <AppStateProvider>
        <Localized />
      </AppStateProvider>
    </RouterProvider>
  );
}
