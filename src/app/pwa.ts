/** Service-worker registration (vite-plugin-pwa). The user decides when to reload into an update. */
import { registerSW } from 'virtual:pwa-register';

export function setupPwa(handlers: {
  onNeedRefresh: (update: () => void) => void;
  onOfflineReady: () => void;
}) {
  if (!('serviceWorker' in navigator)) return;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      handlers.onNeedRefresh(() => void update(true));
    },
    onOfflineReady() {
      handlers.onOfflineReady();
    },
  });
}
