/**
 * Global app state: settings, active location and equipment (live from
 * IndexedDB), resolved sky brightness, catalogue readiness and weather.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SiteSky } from '../astro/lightPollution';
import { resolveSiteSky } from '../astro/lightPollution';
import type { RigInput } from '../astro/scoring';
import type { HourlyWeatherScore } from '../astro/weatherScore';
import { DEFAULT_SETTINGS, normalizeSettings, updateSettings } from '../db/settings';
import type { AppSettings, ObservingLocation, RigProfile } from '../db/types';
import { userDb } from '../db/userDb';
import { useLiveQuery } from '../ui/hooks';
import type { CatalogueInfo, WeatherInput } from '../workers/serviceTypes';
import { initCatalogue } from './catalogClient';
import type { EquipmentSet } from './rig';
import { buildRigInput } from './rig';
import type { WeatherResult } from '../weather/weatherService';
import { getWeather, scoreForecast } from '../weather/weatherService';

export interface WeatherState {
  result: WeatherResult | null;
  hourly: HourlyWeatherScore[] | null;
  loading: boolean;
  refresh: (force?: boolean) => void;
  /** Input for the worker (null when disabled/unavailable). */
  input: WeatherInput | null;
}

export interface AppState {
  settings: AppSettings;
  settingsLoaded: boolean;
  update: (patch: Partial<Omit<AppSettings, 'id'>>) => Promise<AppSettings>;
  locations: ObservingLocation[];
  location: ObservingLocation | null;
  rigs: RigProfile[];
  rig: RigProfile | null;
  equipment: EquipmentSet;
  rigInput: RigInput | null;
  sky: SiteSky;
  catalogue: { ready: boolean; info: CatalogueInfo | null; error: string | null };
  weather: WeatherState;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function locationSky(loc: ObservingLocation | null): SiteSky {
  return resolveSiteSky({
    sqmManual: loc?.sqmManual,
    bortleManual: loc?.bortleManual,
    atlasSqm: loc?.atlasSqm,
  });
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const settingsRow = useLiveQuery(
    () => userDb().settings.get('app'),
    [],
    undefined as AppSettings | undefined | null,
  );
  const [settingsLoaded, setLoaded] = useState(false);
  useEffect(() => {
    if (settingsRow !== undefined) setLoaded(true);
  }, [settingsRow]);
  const settings = useMemo(() => normalizeSettings(settingsRow ?? DEFAULT_SETTINGS), [settingsRow]);
  const locations = useLiveQuery(
    () => userDb().locations.orderBy('name').toArray(),
    [],
    [] as ObservingLocation[],
  );
  const rigs = useLiveQuery(() => userDb().rigs.orderBy('name').toArray(), [], [] as RigProfile[]);
  const cameras = useLiveQuery(() => userDb().cameras.orderBy('name').toArray(), [], []);
  const optics = useLiveQuery(() => userDb().optics.orderBy('name').toArray(), [], []);
  const mounts = useLiveQuery(() => userDb().mounts.orderBy('name').toArray(), [], []);
  const filters = useLiveQuery(() => userDb().filters.orderBy('name').toArray(), [], []);
  const equipment = useMemo(
    () => ({ cameras, optics, mounts, filters }),
    [cameras, optics, mounts, filters],
  );
  const location = useMemo(
    () => locations.find((l) => l.id === settings.activeLocationId) ?? locations[0] ?? null,
    [locations, settings.activeLocationId],
  );
  const rig = useMemo(
    () => rigs.find((r) => r.id === settings.activeRigId) ?? rigs[0] ?? null,
    [rigs, settings.activeRigId],
  );
  const rigInput = useMemo(() => buildRigInput(rig, equipment), [rig, equipment]);
  const sky = useMemo(() => locationSky(location), [location]);

  const [catalogue, setCatalogue] = useState<AppState['catalogue']>({
    ready: false,
    info: null,
    error: null,
  });
  useEffect(() => {
    initCatalogue().then(
      (info) => setCatalogue({ ready: true, info, error: null }),
      (e: Error) => setCatalogue({ ready: false, info: null, error: e.message }),
    );
  }, []);

  const [weatherResult, setWeatherResult] = useState<WeatherResult | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherTick, setWeatherTick] = useState<{ n: number; force: boolean }>({
    n: 0,
    force: false,
  });
  const lat = location?.latDeg;
  const lon = location?.lonDeg;
  useEffect(() => {
    if (settings.weatherEnabled !== true || lat === undefined || lon === undefined) {
      setWeatherResult(null);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    setWeatherLoading(true);
    getWeather(lat, lon, { force: weatherTick.force, signal: ctrl.signal })
      .then((r) => alive && setWeatherResult(r))
      .finally(() => alive && setWeatherLoading(false));
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [settings.weatherEnabled, lat, lon, weatherTick]);
  // Refresh the forecast periodically while the app is open.
  useEffect(() => {
    const id = setInterval(
      () => setWeatherTick((t) => ({ n: t.n + 1, force: false })),
      30 * 60_000,
    );
    return () => clearInterval(id);
  }, []);
  const refresh = useCallback((force = true) => setWeatherTick((t) => ({ n: t.n + 1, force })), []);
  const hourly = useMemo(() => scoreForecast(weatherResult?.forecast ?? null), [weatherResult]);
  const weather: WeatherState = useMemo(
    () => ({
      result: weatherResult,
      hourly,
      loading: weatherLoading,
      refresh,
      input:
        settings.weatherEnabled === true && hourly && weatherResult?.forecast
          ? { hourly, forecastEndMs: weatherResult.forecast.forecastEndMs }
          : null,
    }),
    [weatherResult, hourly, weatherLoading, refresh, settings.weatherEnabled],
  );

  const value: AppState = {
    settings,
    settingsLoaded,
    update: updateSettings,
    locations,
    location,
    rigs,
    rig,
    equipment,
    rigInput,
    sky,
    catalogue,
    weather,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
