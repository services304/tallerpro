import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { es, type Key } from './es';
import { fr } from './fr';

export type Lang = 'fr' | 'en' | 'es';
export const LANGS: Lang[] = ['fr', 'en', 'es'];
const dicts: Record<Lang, Record<Key, string>> = { es, en, fr };
const STORE = 'tallerpro.lang';
const TZ = 'America/Toronto';

export function initialLang(): Lang {
  try {
    const s = localStorage.getItem(STORE);
    if (s && (LANGS as string[]).includes(s)) return s as Lang;
  } catch {
    /* almacenamiento bloqueado */
  }
  const nav = (navigator.language || 'fr').slice(0, 2);
  return (LANGS as string[]).includes(nav) ? (nav as Lang) : 'fr';
}

/** Idioma actual fuera de React (para el cliente de la API). */
export let currentLang: Lang = typeof navigator === 'undefined' ? 'fr' : initialLang();

export function translate(lang: Lang, key: Key, params: Record<string, string | number> = {}): string {
  const s = dicts[lang][key] ?? es[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
}

const locales: Record<Lang, string> = { fr: 'fr-CA', en: 'en-CA', es: 'es' };

export function makeFormat(lang: Lang) {
  const loc = locales[lang];
  return {
    /** Montos: 1 234,56 $ (FR y ES) · $1,234.56 (EN) */
    money(cents: number | null | undefined) {
      const v = (cents ?? 0) / 100;
      const s = new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
      return lang === 'en' ? (v < 0 ? `-$${s.replace('-', '')}` : `$${s}`) : `${s} $`;
    },
    date(d: string | Date | null | undefined) {
      if (!d) return '';
      return new Intl.DateTimeFormat(loc, { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
    },
    dayLong(d: string | Date) {
      return new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d));
    },
    dayShort(d: string | Date) {
      return new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(d));
    },
    time(d: string | Date) {
      return new Intl.DateTimeFormat(loc, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: lang === 'en' }).format(new Date(d));
    },
    dateTime(d: string | Date) {
      return new Intl.DateTimeFormat(loc, { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: lang === 'en' }).format(new Date(d));
    },
    number(n: number | null | undefined) {
      return n === null || n === undefined ? '' : new Intl.NumberFormat(loc).format(n);
    },
  };
}

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, params?: Record<string, string | number>) => string;
  f: ReturnType<typeof makeFormat>;
}

const I18nCtx = createContext<Ctx | null>(null);

export function I18nProvider({ children, onChange }: { children: ReactNode; onChange?: (l: Lang) => void }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback(
    (l: Lang) => {
      currentLang = l;
      setLangState(l);
      try {
        localStorage.setItem(STORE, l);
      } catch {
        /* sin almacenamiento: solo esta sesión */
      }
      onChange?.(l);
    },
    [onChange],
  );
  const value = useMemo<Ctx>(
    () => ({ lang, setLang, t: (k, p) => translate(lang, k, p), f: makeFormat(lang) }),
    [lang, setLang],
  );
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nCtx);
  if (!c) throw new Error('useI18n fuera de I18nProvider');
  return c;
}

export type { Key };
