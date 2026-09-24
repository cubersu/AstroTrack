/**
 * Catalogue & planning service. Runs inside a Web Worker in the app (see
 * catalog.worker.ts) but is plain TypeScript, so it is unit-testable in Node.
 */
import { DEFAULT_SCORING_SETTINGS } from '../astro/config';
import { angularSeparationDeg } from '../astro/coordinates';
import { queryDiscInclusive } from '../astro/healpix';
import type { NightGrid } from '../astro/nightGrid';
import { buildNightGrid } from '../astro/nightGrid';
import { TYPE_PROFILES } from '../astro/objectTypes';
import type { EvaluationContext, TargetInput } from '../astro/scoring';
import { evaluateDso } from '../astro/scoring';
import type { CalendarDate } from '../astro/time';
import { addDays, formatCalendarDate } from '../astro/time';
import { tonightScore } from '../astro/tonight';
import { computeNight } from '../astro/twilight';
import { culminationAltitudeDeg } from '../astro/visibility';
import type { CatalogueFilter, CatalogueSort } from '../catalog/catalogStore';
import { CatalogStore } from '../catalog/catalogStore';
import type { StarColumns } from '../catalog/format';
import { BV_UNKNOWN, decodeStars } from '../catalog/format';
import type { CatalogueManifest, DsoDetail, DsoSummary, NameRow } from '../catalog/types';
import {
  getPackState,
  listPackStates,
  loadBundledRegistry,
  readPackFile,
  readPackJson,
  setDataBaseUrl,
} from '../data/packs';
import type { PackManifest, PackRegistry } from '../data/packTypes';
import type { ProgressFn } from './rpc';
import type {
  BrowseResponse,
  CatalogueInfo,
  DetailResponse,
  EvaluateRequest,
  EvaluateResponse,
  NightRequest,
  OpportunityNight,
  OpportunityRequest,
  OpportunityResponse,
  ScanItem,
  ScanRequest,
  ScanResponse,
  StarFieldRequest,
  StarFieldResponse,
} from './serviceTypes';

export function summaryToTarget(s: DsoSummary): TargetInput {
  return {
    id: s.id,
    type: s.type,
    raDeg: s.raDeg,
    decDeg: s.decDeg,
    majorArcmin: s.majorArcmin,
    minorArcmin: s.minorArcmin,
    positionAngleDeg: s.positionAngleDeg,
    magV: s.magV,
    magB: s.magB,
    sbCatalogue: s.sbCatalogue,
    sbBand: s.sbBand,
  };
}

interface StarTilePack {
  manifest: PackManifest;
  order: number;
  cache: Map<number, StarColumns | null>;
}

export class CatalogService {
  private store: CatalogStore | null = null;
  private registry: PackRegistry | null = null;
  private catalogueMeta: CatalogueManifest | null = null;
  private source: 'bundled' | 'installed' = 'bundled';
  private grids = new Map<string, NightGrid>();
  private details = new Map<number, DsoDetail[]>();
  private coreStars: StarColumns | null = null;
  private starNames: Array<[number, string | null, string | null, string | null, number | null]> =
    [];
  private starTilePacks: StarTilePack[] | null = null;

  async init(dataBaseUrl: string): Promise<CatalogueInfo> {
    setDataBaseUrl(dataBaseUrl);
    return this.reload();
  }

  async reload(): Promise<CatalogueInfo> {
    this.registry = await loadBundledRegistry();
    const bundled = this.registry.packs.find((p) => p.id === 'dso-core');
    const state = await getPackState('dso-core');
    this.source = state ? 'installed' : 'bundled';
    const version = state?.activeVersion ?? bundled?.version ?? 'unknown';
    const index = await readPackFile('dso-core', 'index.bin', bundled);
    const names = await readPackJson<NameRow[]>('dso-core', 'names.json', bundled);
    if (!index || !names) throw new Error('DSO catalogue not available');
    this.catalogueMeta = await readPackJson<CatalogueManifest>(
      'dso-core',
      'catalogue.json',
      bundled,
    );
    this.store = CatalogStore.fromBuffers(index, names, version);
    this.details.clear();
    this.starTilePacks = null;
    return this.info();
  }

  info(): CatalogueInfo {
    const s = this.requireStore();
    return {
      count: s.count,
      version: s.version,
      source: this.source,
      typeCounts: this.catalogueMeta?.typeCounts ?? {},
    };
  }

  private requireStore(): CatalogStore {
    if (!this.store) throw new Error('Catalogue not initialised');
    return this.store;
  }

  search(query: string, limit = 30, filter?: CatalogueFilter): DsoSummary[] {
    return this.requireStore().search(query, limit, filter);
  }

  browse(
    filter: CatalogueFilter,
    sort: CatalogueSort,
    offset: number,
    limit: number,
  ): BrowseResponse {
    const s = this.requireStore();
    const idx = s.filterIndices(filter, sort);
    return { total: idx.length, items: idx.slice(offset, offset + limit).map((i) => s.summary(i)) };
  }

  summaries(ids: string[]): DsoSummary[] {
    const s = this.requireStore();
    const out: DsoSummary[] = [];
    for (const id of ids) {
      const i = s.indexOf(id);
      if (i !== undefined) out.push(s.summary(i));
    }
    return out;
  }

  async detail(id: string): Promise<DetailResponse | null> {
    const s = this.requireStore();
    const i = s.indexOf(id);
    if (i === undefined) return null;
    const size = this.catalogueMeta?.detailChunkSize ?? 500;
    const chunk = Math.floor(i / size);
    if (!this.details.has(chunk)) {
      const bundled = this.registry?.packs.find((p) => p.id === 'dso-core');
      const data = await readPackJson<DsoDetail[]>(
        'dso-core',
        `details/${String(chunk).padStart(3, '0')}.json`,
        bundled,
      ).catch(() => null);
      this.details.set(chunk, data ?? []);
    }
    return { summary: s.summary(i), detail: this.details.get(chunk)?.[i % size] ?? null };
  }

  private grid(req: Pick<NightRequest, 'location' | 'date' | 'stepMinutes'>): NightGrid {
    const step = req.stepMinutes ?? 10;
    const key = `${req.location.latDeg.toFixed(4)},${req.location.lonDeg.toFixed(4)},${formatCalendarDate(req.date)},${step}`;
    let g = this.grids.get(key);
    if (!g) {
      g = buildNightGrid(req.location, computeNight(req.date, req.location), step);
      if (this.grids.size > 120) this.grids.clear();
      this.grids.set(key, g);
    }
    return g;
  }

  private context(req: NightRequest, grid: NightGrid): EvaluationContext {
    return {
      grid,
      sky: req.sky,
      settings: req.settings ?? DEFAULT_SCORING_SETTINGS,
      exposureMode: req.exposureMode,
      timeMode: req.timeMode,
      nowMs: req.nowMs,
      availableHours: req.availableHours,
    };
  }

  scan(req: ScanRequest, progress?: ProgressFn): ScanResponse {
    const t0 = Date.now();
    const s = this.requireStore();
    const grid = this.grid(req);
    const ctx = this.context(req, grid);
    const minAlt = ctx.settings.minAltitudeDeg;
    const items: ScanItem[] = [];
    let evaluated = 0;
    const n = s.count;
    const filter = req.filter;
    for (let i = 0; i < n; i++) {
      if (progress && i % 1000 === 0) progress(i / n);
      const type = s.summary(i).type;
      if (!TYPE_PROFILES[type].scored) continue;
      if (culminationAltitudeDeg(s.cols.dec[i], req.location.latDeg) < minAlt) continue;
      if (filter && !s.matches(i, filter)) continue;
      evaluated++;
      const summary = s.summary(i);
      const ev = evaluateDso(summaryToTarget(summary), req.rig, ctx);
      if (!req.includeUnsuitable && ev.score === 0) continue;
      const tn = tonightScore(ev, req.weather?.hourly ?? null, ctx.settings, {
        availableHours: req.availableHours,
        weatherEnabled: req.weatherEnabled,
        forecastEndMs: req.weather?.forecastEndMs ?? null,
      });
      const { session, ...tonightRest } = tn;
      items.push({
        summary,
        astroScore: ev.score,
        tonight: { ...tonightRest, sessionScore: session?.score ?? null },
        scoreClass: ev.scoreClass,
        confidence: ev.confidence.level,
        hardConstraints: ev.hardConstraints,
        insufficientData: ev.insufficientData,
        opticsId: ev.optics?.opticsId ?? null,
        focalLengthMm: ev.optics?.focalLengthMm ?? null,
        fNumber: ev.optics?.fNumber ?? null,
        fill: ev.optics && Number.isFinite(ev.optics.framing.fill) ? ev.optics.framing.fill : null,
        window: ev.window,
        usableHours: ev.usableHours,
        recommendedH: ev.integration?.recommendedH ?? null,
        maxAltDeg: ev.visibility?.maxDarkAltDeg ?? -90,
        moonSepDeg: ev.moon?.meanSeparationDeg ?? null,
        reasons: ev.reasons.filter((r) => r.polarity !== 'info').slice(0, 6),
      });
    }
    const key =
      req.sortBy === 'astro' ? (x: ScanItem) => x.astroScore : (x: ScanItem) => x.tonight.score;
    items.sort(
      (a, b) =>
        key(b) - key(a) ||
        b.astroScore - a.astroScore ||
        s.notability(b.summary.index) - s.notability(a.summary.index),
    );
    progress?.(1);
    return {
      night: grid.night,
      moon: grid.moonAtMidnight,
      total: n,
      evaluated,
      tookMs: Date.now() - t0,
      items: items.slice(0, req.limit),
    };
  }

  evaluate(req: EvaluateRequest): EvaluateResponse | null {
    const s = this.requireStore();
    const i = s.indexOf(req.id);
    if (i === undefined) return null;
    const summary = s.summary(i);
    const grid = this.grid(req);
    const ctx = this.context(req, grid);
    const ev = evaluateDso(summaryToTarget(summary), req.rig, ctx);
    const tn = tonightScore(ev, req.weather?.hourly ?? null, ctx.settings, {
      availableHours: req.availableHours,
      weatherEnabled: req.weatherEnabled,
      forecastEndMs: req.weather?.forecastEndMs ?? null,
    });
    const curve = ev.visibility?.curve.alt;
    const { visibility, ...rest } = ev;
    let vis: EvaluateResponse['evaluation']['visibility'] = null;
    if (visibility) {
      const { curve: _curve, ...v } = visibility;
      vis = v;
    }
    return {
      summary,
      evaluation: { ...rest, visibility: vis },
      tonight: tn,
      night: grid.night,
      moon: grid.moonAtMidnight,
      curves: {
        times: Array.from(grid.times),
        sunAlt: Array.from(grid.sunAlt),
        moonAlt: Array.from(grid.moonAlt),
        dark: Array.from(grid.dark),
        targetAlt: curve ? Array.from(curve) : [],
      },
    };
  }

  /** Per-night scores for a set of targets over a date range (favourites scan). */
  opportunities(req: OpportunityRequest, progress?: ProgressFn): OpportunityResponse {
    const t0 = Date.now();
    const targets = this.summaries(req.ids);
    const nights: OpportunityNight[][] = targets.map(() => []);
    for (let d = 0; d < req.days; d++) {
      progress?.(d / req.days);
      const date: CalendarDate = addDays(req.startDate, d);
      const grid = this.grid({ location: req.location, date, stepMinutes: req.stepMinutes ?? 20 });
      const ctx = this.context({ ...req, date, timeMode: 'tonight' }, grid);
      targets.forEach((t, k) => {
        const ev = evaluateDso(summaryToTarget(t), req.rig, ctx);
        const tn = tonightScore(ev, req.weather?.hourly ?? null, ctx.settings, {
          availableHours: req.availableHours,
          weatherEnabled: req.weatherEnabled,
          forecastEndMs: req.weather?.forecastEndMs ?? null,
        });
        nights[k].push({
          date,
          astroScore: ev.score,
          tonightScore: tn.score,
          weatherStatus: tn.weatherStatus,
          window: ev.window,
          usableHours: ev.usableHours,
          moonIllumination: grid.moonAtMidnight.illumination,
        });
      });
    }
    progress?.(1);
    return {
      targets: targets.map((summary, k) => {
        const list = nights[k];
        const best = list.reduce<OpportunityNight | null>(
          (b, n) => (!b || n.tonightScore > b.tonightScore ? n : b),
          null,
        );
        return { summary, nights: list, best: best && best.tonightScore > 0 ? best : null };
      }),
      tookMs: Date.now() - t0,
    };
  }

  /* -------------------------------- stars -------------------------------- */

  private async loadCoreStars() {
    if (this.coreStars) return;
    const bundled = this.registry?.packs.find((p) => p.id === 'stars-core');
    const buf = await readPackFile('stars-core', 'stars.bin', bundled);
    if (buf) this.coreStars = decodeStars(buf);
    this.starNames =
      (await readPackJson<typeof this.starNames>('stars-core', 'names.json', bundled)) ?? [];
  }

  private async loadStarTilePacks(): Promise<StarTilePack[]> {
    if (this.starTilePacks) return this.starTilePacks;
    const states = await listPackStates();
    this.starTilePacks = states
      .filter((st) => st.manifest.kind === 'star-tiles' && st.manifest.tiling)
      .map((st) => ({ manifest: st.manifest, order: st.manifest.tiling!.order, cache: new Map() }));
    return this.starTilePacks;
  }

  invalidateStarPacks() {
    this.starTilePacks = null;
  }

  async starField(req: StarFieldRequest): Promise<StarFieldResponse> {
    await this.loadCoreStars();
    const ra: number[] = [];
    const dec: number[] = [];
    const mag: number[] = [];
    const bv: number[] = [];
    const sources: string[] = [];
    const max = req.maxStars ?? 20000;
    const cosR = Math.cos((req.radiusDeg * Math.PI) / 180);
    const d0 = (req.decDeg * Math.PI) / 180;
    const r0 = (req.raDeg * Math.PI) / 180;
    const sd0 = Math.sin(d0);
    const cd0 = Math.cos(d0);
    const inside = (raDeg: number, decDeg: number) => {
      const d = (decDeg * Math.PI) / 180;
      return sd0 * Math.sin(d) + cd0 * Math.cos(d) * Math.cos((raDeg * Math.PI) / 180 - r0) >= cosR;
    };
    const push = (c: StarColumns, i: number) => {
      const m = c.mag[i] / 100;
      if (m > req.magLimit) return;
      if (!inside(c.ra[i], c.dec[i])) return;
      ra.push(c.ra[i]);
      dec.push(c.dec[i]);
      mag.push(m);
      bv.push(c.bv[i] === BV_UNKNOWN ? Number.NaN : c.bv[i] / 1000);
    };
    const labels: StarFieldResponse['labels'] = [];
    if (this.coreStars) {
      sources.push('stars-core');
      const c = this.coreStars;
      for (let i = 0; i < c.count; i++) push(c, i);
      for (const [i, proper, bayer] of this.starNames) {
        const m = c.mag[i] / 100;
        if (m > Math.min(req.magLimit, 6.5)) continue;
        if (!inside(c.ra[i], c.dec[i])) continue;
        const label = proper ?? bayer;
        if (label) labels.push({ ra: c.ra[i], dec: c.dec[i], label, mag: m });
      }
    }
    if (req.magLimit > 8) {
      for (const pack of await this.loadStarTilePacks()) {
        const nside = 1 << pack.order;
        const tiles = queryDiscInclusive(nside, req.raDeg, req.decDeg, req.radiusDeg);
        let used = false;
        for (const t of tiles) {
          if (!pack.cache.has(t)) {
            const buf = await readPackFile(
              pack.manifest.id,
              `tiles/${String(t).padStart(4, '0')}.bin`,
            );
            pack.cache.set(t, buf ? decodeStars(buf) : null);
          }
          const c = pack.cache.get(t);
          if (!c) continue;
          used = true;
          for (let i = 0; i < c.count; i++) push(c, i);
        }
        if (used) sources.push(pack.manifest.id);
      }
    }
    // Keep the brightest stars if over budget.
    let order = ra.map((_, i) => i);
    if (order.length > max) order = order.sort((a, b) => mag[a] - mag[b]).slice(0, max);
    return {
      ra: Float32Array.from(order.map((i) => ra[i])),
      dec: Float32Array.from(order.map((i) => dec[i])),
      mag: Float32Array.from(order.map((i) => mag[i])),
      bv: Float32Array.from(order.map((i) => bv[i])),
      labels: labels.sort((a, b) => a.mag - b.mag).slice(0, 60),
      sources,
      magLimitUsed: req.magLimit,
    };
  }

  /** Nearby DSOs for sky-map/framing overlays. */
  nearby(raDeg: number, decDeg: number, radiusDeg: number, limit = 200): DsoSummary[] {
    const s = this.requireStore();
    const out: Array<[number, number]> = [];
    for (let i = 0; i < s.count; i++) {
      const sep = angularSeparationDeg(raDeg, decDeg, s.cols.ra[i], s.cols.dec[i]);
      if (sep <= radiusDeg) out.push([i, s.notability(i)]);
    }
    return out
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([i]) => s.summary(i));
  }
}
