import { liveQuery } from 'dexie';
import { useEffect, useRef, useState } from 'react';

/** Subscribe to a Dexie live query (re-runs when the underlying tables change). */
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const q = useRef(query);
  q.current = query;
  useEffect(() => {
    const sub = liveQuery(() => q.current()).subscribe({
      next: (v) => setValue(v),
      error: (e) => console.error('liveQuery', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

/** Run an async function when deps change; stale results are discarded. */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: undefined,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    f.current().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: Error) => alive && setState({ data: undefined, error, loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Current time, updated every `intervalMs`. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
