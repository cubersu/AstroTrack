import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogApi } from '../../app/catalogClient';
import type { CalendarDate } from '../../astro/time';
import type { DetailResponse, EvaluateResponse } from '../../workers/serviceTypes';
import { availableHoursFromSettings, geo } from '../common/nightHooks';
import type { OpticsSelection } from './opticsSelection';
import { applyOpticsSelection, selectionKey } from './opticsSelection';

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

/** Delay applied to optics changes (e.g. dragging the zoom slider) before re-evaluating. */
const SELECTION_DEBOUNCE_MS = 250;

export function useEvaluation(
  id: string,
  date: CalendarDate | null,
  selection: OpticsSelection | null = null,
) {
  const app = useApp();
  const [ev, setEv] = useState<EvaluateResponse | null>(null);
  /** The optics selection the current `ev` was computed for. */
  const [evSelection, setEvSelection] = useState<OpticsSelection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = selectionKey(selection);
  const [debounced, setDebounced] = useState(selection);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(selection), SELECTION_DEBOUNCE_MS);
    return () => clearTimeout(h);
    // `key` captures the selection's content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const debouncedKey = selectionKey(debounced);
  const rig = useMemo(
    () => (app.rigInput ? applyOpticsSelection(app.rigInput, debounced) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app.rigInput, debouncedKey],
  );

  useEffect(() => {
    if (!app.catalogue.ready || !app.location || !rig || !date) {
      setEv(null);
      return;
    }
    let alive = true;
    const sel = debounced;
    catalogApi()
      .evaluate({
        id,
        location: geo(app.location),
        date,
        rig,
        sky: app.sky,
        settings: app.settings.scoring,
        exposureMode: app.settings.exposureMode,
        timeMode: 'tonight',
        availableHours: availableHoursFromSettings(app.settings),
        weather: app.weather.input,
        weatherEnabled: app.settings.weatherEnabled === true,
      })
      .then(
        (r) => alive && (setEv(r), setEvSelection(sel), setError(null)),
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
    rig,
    app.sky,
    app.settings,
    app.weather.input,
  ]);
  return { ev, error, evSelection };
}
