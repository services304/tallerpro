import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, get } from './api';
import type { Lang } from './i18n';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'reception' | 'mechanic';
  is_mechanic: boolean;
  lang: Lang;
}

interface Session {
  /** 'offline': no se pudo hablar con el servidor (p. ej. se está despertando). */
  state: 'loading' | 'setup' | 'anon' | 'in' | 'offline';
  user: User | null;
  shop: { shop_name: string; default_lang: Lang } | null;
  refresh: () => Promise<void>;
  setAnon: () => void;
}

const Ctx = createContext<Session | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pregunta al servidor si ya existe la cuenta del dueño. Reintenta mientras el servidor
 * gratuito se despierta (puede tardar ~1 minuto), en vez de suponer que ya hay una cuenta.
 */
export async function fetchSetupStatus(tries = 8): Promise<{ needsSetup: boolean } | null> {
  for (let i = 0; i < tries; i++) {
    try {
      return await get('/setup/status');
    } catch {
      if (i < tries - 1) await wait(Math.min(2000 * (i + 1), 8000));
    }
  }
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Session['state']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Session['shop']>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await get('/auth/me');
      setUser(me.user);
      setShop(me.shop);
      setState('in');
      return;
    } catch (e) {
      setUser(null);
      // Un 401 es «no hay sesión»; cualquier otro error es «el servidor no respondió bien».
      if (!(e instanceof ApiError && e.status === 401)) setState('loading');
    }
    const s = await fetchSetupStatus();
    setState(s === null ? 'offline' : s.needsSetup ? 'setup' : 'anon');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ state, user, shop, refresh, setAnon: () => (setUser(null), setState('anon')) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession fuera de SessionProvider');
  return c;
}
