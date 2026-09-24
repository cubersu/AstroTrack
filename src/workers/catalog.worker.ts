/// <reference lib="webworker" />
import { CatalogService } from './catalogService';
import { eventsService } from './eventsService';
import { expose } from './rpc';

const service = new CatalogService();

export const handlers = {
  init: (dataBaseUrl: string) => service.init(dataBaseUrl),
  reload: () => service.reload(),
  info: () => service.info(),
  search: (...a: Parameters<CatalogService['search']>) => service.search(...a),
  browse: (...a: Parameters<CatalogService['browse']>) => service.browse(...a),
  summaries: (ids: string[]) => service.summaries(ids),
  detail: (id: string) => service.detail(id),
  scan: (...a: Parameters<CatalogService['scan']>) => service.scan(...a),
  evaluate: (...a: Parameters<CatalogService['evaluate']>) => service.evaluate(...a),
  opportunities: (...a: Parameters<CatalogService['opportunities']>) => service.opportunities(...a),
  starField: (...a: Parameters<CatalogService['starField']>) => service.starField(...a),
  nearby: (...a: Parameters<CatalogService['nearby']>) => service.nearby(...a),
  invalidateStarPacks: () => service.invalidateStarPacks(),
  events: (...a: Parameters<typeof eventsService.events>) => eventsService.events(...a),
  planets: (...a: Parameters<typeof eventsService.planets>) => eventsService.planets(...a),
  cometsTonight: (...a: Parameters<typeof eventsService.cometsTonight>) =>
    eventsService.cometsTonight(...a),
  cometOpportunities: (...a: Parameters<typeof eventsService.cometOpportunities>) =>
    eventsService.cometOpportunities(...a),
};

export type CatalogHandlers = typeof handlers;

expose(handlers);
