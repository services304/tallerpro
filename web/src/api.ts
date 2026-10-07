import { currentLang } from './i18n';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

type Listener = (v: string) => void;
const versionListeners = new Set<Listener>();
const authListeners = new Set<() => void>();
let serverVersion: string | null = null;

/** Avisa si la pantalla y el servidor tienen versiones distintas. */
export function onVersionMismatch(fn: Listener) {
  versionListeners.add(fn);
  if (serverVersion && serverVersion !== APP_VERSION) fn(serverVersion);
  return () => {
    versionListeners.delete(fn);
  };
}

export function onAuthLost(fn: () => void) {
  authListeners.add(fn);
  return () => {
    authListeners.delete(fn);
  };
}

function checkVersion(res: Response) {
  const v = res.headers.get('x-app-version');
  if (v && v !== serverVersion) {
    serverVersion = v;
    if (v !== APP_VERSION && APP_VERSION !== 'dev') versionListeners.forEach((fn) => fn(v));
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'x-requested-with': 'tallerpro',
        'x-lang': currentLang,
        ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'offline', { fr: 'Pas de connexion au serveur.', en: 'No connection to the server.', es: 'Sin conexión con el servidor.' }[currentLang]);
  }
  checkVersion(res);
  if (res.status === 401 && !path.startsWith('/portal') && !path.startsWith('/auth/login')) authListeners.forEach((fn) => fn());
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    const j = type.includes('json') ? await res.json().catch(() => null) : null;
    throw new ApiError(res.status, j?.error ?? 'server.error', j?.message ?? `${res.status} ${res.statusText}`);
  }
  if (type.includes('json')) return res.json() as Promise<T>;
  return (await res.text()) as unknown as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b: unknown = {}) => api<T>('POST', p, b);
export const patch = <T = any>(p: string, b: unknown) => api<T>('PATCH', p, b);
export const put = <T = any>(p: string, b: unknown) => api<T>('PUT', p, b);
export const del = <T = any>(p: string) => api<T>('DELETE', p);
