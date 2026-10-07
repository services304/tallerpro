import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { api, ApiError } from '../api';
import { translate, useI18n, currentLang, type Key } from '../i18n';

// ---------- Datos ----------

export function useLoad<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await api<T>('GET', path);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e as ApiError);
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

/** Ejecuta una acción mostrando el error traducido del servidor si falla. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (okMsg) toast(okMsg);
        return r;
      } catch (e) {
        toast((e as Error).message, true);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { run, busy };
}

// ---------- Avisos flotantes ----------

type ToastFn = (msg: string, error?: boolean) => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; error: boolean }[]>([]);
  const push = useCallback<ToastFn>((msg, error = false) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, msg, error }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), error ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => (
          <div key={i.id} className={`toast${i.error ? ' err' : ''}`}>
            {i.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------- Errores: nunca una pantalla en blanco ----------

export class ErrorBoundary extends Component<{ where: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.where}]`, error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const where = this.props.where;
    return (
      <div className="main">
        <div className="error" role="alert">
          <strong>{translate(currentLang, 'app.crash')}</strong>
          <p className="small">{translate(currentLang, 'app.crashDetail', { where, message: this.state.error.message })}</p>
        </div>
        <button className="btn" onClick={() => location.reload()}>
          {translate(currentLang, 'app.reload')}
        </button>
      </div>
    );
  }
}

export function Loading() {
  const { t } = useI18n();
  return <p className="muted" aria-busy="true">{t('app.loading')}</p>;
}

export function LoadError({ error, retry }: { error: ApiError; retry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="stack">
      <p className="error" role="alert">{error.message}</p>
      {retry && (
        <button className="btn" onClick={retry}>
          {t('app.reload')}
        </button>
      )}
    </div>
  );
}

// ---------- Formularios ----------

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Input({ label, hint, ...p }: { label: ReactNode; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint}>
      <input {...p} />
    </Field>
  );
}

export function TextArea({ label, hint, ...p }: { label: ReactNode; hint?: ReactNode } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint}>
      <textarea {...p} />
    </Field>
  );
}

export function Select({ label, hint, children, ...p }: { label: ReactNode; hint?: ReactNode; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint}>
      <select {...p}>{children}</select>
    </Field>
  );
}

export function Check({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de dinero: el usuario escribe dólares (12,50 o 12.50), el valor es en centavos. */
export function MoneyInput({ label, cents, onChange, hint }: { label: ReactNode; cents: number | null; onChange: (c: number | null) => void; hint?: ReactNode }) {
  const [text, setText] = useState(cents === null ? '' : (cents / 100).toFixed(2));
  useEffect(() => {
    const parsed = parseMoney(text);
    if (parsed !== cents) setText(cents === null ? '' : (cents / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <Field label={label} hint={hint}>
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
      />
    </Field>
  );
}

export function parseMoney(s: string): number | null {
  const clean = s.replace(/[\s$]/g, '').replace(',', '.');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// ---------- Hoja modal ----------

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} onCancel={onClose} aria-label={title}>
      {open && (
        <div className="sheet-body">
          <div className="sheet-head">
            <h2>{title}</h2>
            <button className="btn ghost" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

// ---------- Estados y etiquetas ----------

const statusTone: Record<string, string> = {
  received: 's-info', diagnosis: 's-info', parts_quote: 's-wait', quote_sent: 's-wait', approved: 's-ok',
  rejected: 's-bad', waiting_parts: 's-wait', in_repair: 's-ok', quality_check: 's-ok', ready: 's-wait',
  delivered: 's-off', closed: 's-off', cancelled: 's-bad',
  issued: 's-wait', partial: 's-wait', paid: 's-ok', void: 's-off',
  sent: 's-ok', queued: 's-info', failed: 's-bad', skipped: 's-off',
  scheduled: 's-info', on_the_way: 's-wait', in_progress: 's-ok', done: 's-off',
};

export function Status({ value, label }: { value: string; label: string }) {
  return <span className={`status ${statusTone[value] ?? 's-off'}`}>{label}</span>;
}

export function OrderStatus({ status }: { status: string }) {
  const { t } = useI18n();
  return <Status value={status} label={t(`status.${status}` as Key)} />;
}

export function Tag({ children, big }: { children: ReactNode; big?: boolean }) {
  return <span className={`tag${big ? ' big' : ''}`}>{children}</span>;
}

export function vehicleName(v: { make?: string; model?: string; year?: number | null } | null | undefined) {
  if (!v) return '';
  return [v.make, v.model, v.year].filter(Boolean).join(' ');
}

export function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function telUrl(phone: string | null | undefined) {
  return phone ? `tel:${phone}` : undefined;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted panel pad">{children}</p>;
}
