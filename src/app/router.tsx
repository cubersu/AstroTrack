/**
 * Minimal hash router (no dependency). Hash routing keeps the static build
 * working from any sub-path and from the service-worker cache offline.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

export interface RouteMatch {
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
}

function currentLocation(): { path: string; query: URLSearchParams } {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs ?? '') };
}

const RouterContext = createContext<{ path: string; query: URLSearchParams }>({
  path: '/',
  query: new URLSearchParams(),
});

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(currentLocation);
  useEffect(() => {
    const onChange = () => {
      setLoc(currentLocation());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return <RouterContext.Provider value={loc}>{children}</RouterContext.Provider>;
}

export function useLocationPath() {
  return useContext(RouterContext);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = '#' + (to.startsWith('/') ? to : '/' + to);
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else window.location.hash = hash;
}

/** Match "/target/:id" style patterns. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export interface RouteDef {
  path: string;
  render: (m: RouteMatch) => ReactNode;
}

export function Routes({ routes, fallback }: { routes: RouteDef[]; fallback: ReactNode }) {
  const { path, query } = useLocationPath();
  for (const r of routes) {
    const params = matchPath(r.path, path);
    if (params) return <>{r.render({ path, params, query })}</>;
  }
  return <>{fallback}</>;
}

export function Link({
  to,
  children,
  ...rest
}: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a href={'#' + (to.startsWith('/') ? to : '/' + to)} {...rest}>
      {children}
    </a>
  );
}

export function useQueryParam(name: string): [string | null, (v: string | null) => void] {
  const { path, query } = useLocationPath();
  const value = query.get(name);
  const set = useCallback(
    (v: string | null) => {
      const q = new URLSearchParams(query);
      if (v === null) q.delete(name);
      else q.set(name, v);
      const s = q.toString();
      navigate(path + (s ? '?' + s : ''), { replace: true });
    },
    [name, path, query],
  );
  return useMemo(() => [value, set], [value, set]);
}
