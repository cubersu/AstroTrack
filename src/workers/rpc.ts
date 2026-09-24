/**
 * Tiny typed RPC over postMessage (no dependencies). The worker exposes an
 * object of async methods; the client calls them by name. Methods receive a
 * `progress` callback as their last argument when the caller provides one.
 */

export type ProgressFn = (value: number) => void;

type CallMsg = { type: 'call'; id: number; method: string; args: unknown[] };
type ResultMsg = { type: 'result'; id: number; result: unknown };
type ErrorMsg = { type: 'error'; id: number; message: string; name?: string };
type ProgressMsg = { type: 'progress'; id: number; value: number };
type OutMsg = ResultMsg | ErrorMsg | ProgressMsg;

interface Endpoint {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handlers = Record<string, (...args: any[]) => unknown>;

export function expose(handlers: Handlers, endpoint: Endpoint = self as unknown as Endpoint) {
  endpoint.addEventListener('message', async (ev: MessageEvent) => {
    const msg = ev.data as CallMsg;
    if (!msg || msg.type !== 'call') return;
    const fn = handlers[msg.method];
    if (!fn) {
      endpoint.postMessage({
        type: 'error',
        id: msg.id,
        message: `Unknown method ${msg.method}`,
      } satisfies ErrorMsg);
      return;
    }
    try {
      const progress: ProgressFn = (value) =>
        endpoint.postMessage({ type: 'progress', id: msg.id, value } satisfies ProgressMsg);
      const result = await fn(...msg.args, progress);
      endpoint.postMessage({ type: 'result', id: msg.id, result } satisfies ResultMsg);
    } catch (err) {
      const e = err as Error;
      endpoint.postMessage({
        type: 'error',
        id: msg.id,
        message: e?.message ?? String(err),
        name: e?.name,
      } satisfies ErrorMsg);
    }
  });
}

type Remote<T extends Handlers> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: DropProgress<A>) => Promise<Awaited<R>>
    : never;
};
// Remove a trailing optional progress parameter from the remote signature.
type DropProgress<A extends unknown[]> = A extends [...infer Rest, ProgressFn?] ? Rest : A;

export interface RpcClient<T extends Handlers> {
  api: Remote<T>;
  callWithProgress<K extends keyof T & string>(
    method: K,
    args: DropProgress<Parameters<T[K]>>,
    onProgress: ProgressFn,
  ): Promise<Awaited<ReturnType<T[K]>>>;
}

export function createClient<T extends Handlers>(endpoint: Endpoint): RpcClient<T> {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: ProgressFn }
  >();
  endpoint.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data as OutMsg;
    const p = pending.get(msg?.id);
    if (!p) return;
    if (msg.type === 'progress') {
      p.progress?.(msg.value);
      return;
    }
    pending.delete(msg.id);
    if (msg.type === 'result') p.resolve(msg.result);
    else {
      const e = new Error(msg.message);
      if (msg.name) e.name = msg.name;
      p.reject(e);
    }
  });
  const call = (method: string, args: unknown[], progress?: ProgressFn) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, progress });
      endpoint.postMessage({ type: 'call', id, method, args } satisfies CallMsg);
    });
  const api = new Proxy(
    {},
    {
      get:
        (_t, prop: string) =>
        (...args: unknown[]) =>
          call(prop, args),
    },
  ) as Remote<T>;
  return {
    api,
    callWithProgress: (method, args, onProgress) =>
      call(method, args as unknown[], onProgress) as Promise<Awaited<ReturnType<T[typeof method]>>>,
  };
}
