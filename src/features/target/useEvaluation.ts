import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogApi } from '../../app/catalogClient';
import type { CalendarDate } from '../../astro/time';
import type { DetailResponse, EvaluateResponse } from '../../workers/serviceTypes';
import { availableHoursFromSettings, geo } from '../common/nightHooks';

export function useTargetDetail(id: string) {
  const app = useApp();
  const [detail, setDetail] = useState<DetailResponse | null | undefined>(undefined);
  useEffect(() => {
    if (!app.catalogue.ready) return;
    let alive = true;
    catalogApi()
      .detail(id)
      .then((d) => alive && setDetail(d));
    return () => {
      alive = false;
    };
  }, [id, app.catalogue.ready]);
  return detail;
}

export function useEvaluation(id: string, date: CalendarDate | null) {
  const app = useApp();
  const [ev, setEv] = useState<EvaluateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!app.catalogue.ready || !app.location || !app.rigInput || !date) {
      setEv(null);
      return;
    }
    let alive = true;
    catalogApi()
      .evaluate({
        id,
        location: geo(app.location),
        date,
        rig: app.rigInput,
        sky: app.sky,
        settings: app.settings.scoring,
        exposureMode: app.settings.exposureMode,
        timeMode: 'tonight',
        availableHours: availableHoursFromSettings(app.settings),
        weather: app.weather.input,
        weatherEnabled: app.settings.weatherEnabled === true,
      })
      .then(
        (r) => alive && (setEv(r), setError(null)),
        (e: Error) => alive && setError(e.message),
      );
    return () => {
      alive = false;
    };
    // Depend on the calendar values, not the object identity of `date`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id,
    date?.year,
    date?.month,
    date?.day,
    app.catalogue.ready,
    app.location,
    app.rigInput,
    app.sky,
    app.settings,
    app.weather.input,
  ]);
  return { ev, error };
}
