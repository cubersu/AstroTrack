/** Main-thread client for the catalogue/planning Web Worker. */
import { createClient } from '../workers/rpc';
import type { RpcClient } from '../workers/rpc';
import type { CatalogHandlers } from '../workers/catalog.worker';

let client: RpcClient<CatalogHandlers> | null = null;
let initPromise: ReturnType<RpcClient<CatalogHandlers>['api']['init']> | null = null;

function getClient(): RpcClient<CatalogHandlers> {
  if (!client) {
    const worker = new Worker(new URL('../workers/catalog.worker.ts', import.meta.url), {
      type: 'module',
    });
    client = createClient<CatalogHandlers>(worker);
  }
  return client;
}

export function catalogApi() {
  return getClient().api;
}

export function catalogWithProgress(): RpcClient<CatalogHandlers>['callWithProgress'] {
  const c = getClient();
  return c.callWithProgress.bind(c) as RpcClient<CatalogHandlers>['callWithProgress'];
}

export function initCatalogue() {
  if (!initPromise) {
    const base = new URL('data/', document.baseURI).href;
    initPromise = catalogApi().init(base);
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

export async function reloadCatalogue() {
  const info = await catalogApi().reload();
  await catalogApi().invalidateStarPacks();
  return info;
}
