import { lazy, Suspense, useEffect, useState } from 'react';
import { detectLanguage, I18nProvider, useI18n } from '../i18n/i18n';
import { ToastProvider, useToast } from '../ui/toast';
import { Spinner } from '../ui/controls';
import { AppShell } from './AppShell';
import { AppStateProvider, useApp } from './AppState';
import { RouterProvider, Routes, navigate } from './router';
import type { RouteDef } from './router';
import { setupPwa } from './pwa';
import { TonightPage } from '../features/tonight/TonightPage';

// Route-level code splitting (all chunks are still precached for offline use).
const ExplorePage = lazy(() =>
  import('../features/explore/ExplorePage').then((m) => ({ default: m.ExplorePage })),
);
const TargetPage = lazy(() =>
  import('../features/target/TargetPage').then((m) => ({ default: m.TargetPage })),
);
const EventsPage = lazy(() =>
  import('../features/events/EventsPage').then((m) => ({ default: m.EventsPage })),
);
const PlansPage = lazy(() =>
  import('../features/plans/PlansPage').then((m) => ({ default: m.PlansPage })),
);
const PlanDetailPage = lazy(() =>
  import('../features/plans/PlanDetailPage').then((m) => ({ default: m.PlanDetailPage })),
);
const SessionPage = lazy(() =>
  import('../features/session/SessionPage').then((m) => ({ default: m.SessionPage })),
);
const JournalPage = lazy(() =>
  import('../features/journal/JournalPage').then((m) => ({ default: m.JournalPage })),
);
const EquipmentPage = lazy(() =>
  import('../features/equipment/EquipmentPage').then((m) => ({ default: m.EquipmentPage })),
);
const LocationsPage = lazy(() =>
  import('../features/locations/LocationsPage').then((m) => ({ default: m.LocationsPage })),
);
const OfflinePage = lazy(() =>
  import('../features/offline/OfflinePage').then((m) => ({ default: m.OfflinePage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const LicensesPage = lazy(() =>
  import('../features/licenses/LicensesPage').then((m) => ({ default: m.LicensesPage })),
);

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
          <Suspense fallback={<Spinner label="…" />}>
            <Routes routes={routes} fallback={<Redirect to="/tonight" />} />
          </Suspense>
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
