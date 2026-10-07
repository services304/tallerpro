import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { get } from './api';
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
  state: 'loading' | 'setup' | 'anon' | 'in';
  user: User | null;
  shop: { shop_name: string; default_lang: Lang } | null;
  refresh: () => Promise<void>;
  setAnon: () => void;
}

const Ctx = createContext<Session | null>(null);

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
    } catch {
      try {
        const s = await get('/setup/status');
        setState(s.needsSetup ? 'setup' : 'anon');
      } catch {
        setState('anon');
      }
      setUser(null);
    }
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
