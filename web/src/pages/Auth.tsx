import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { post } from '../api';
import { LangSwitch } from '../App';
import { Input } from '../components/ui';
import { useI18n } from '../i18n';
import { useSession } from '../session';
import { APP_VERSION } from '../api';

function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="auth">
      <div className="auth-box">
        <div className="auth-brand">
          <span className="tag big">TallerPro</span>
        </div>
        <div className="row between">
          <h1>{title}</h1>
          <LangSwitch />
        </div>
        {children}
        <p className="muted small">
          {t('app.version', { v: APP_VERSION })} · <Link to="/privacy">{t('more.privacy')}</Link>
        </p>
      </div>
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const s = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (s.state === 'in') return <Navigate to="/" replace />;
  if (s.state === 'setup') return <Navigate to="/setup" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/auth/login', { email, password });
      await s.refresh();
      nav((loc.state as any)?.from ?? '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={t('auth.title')}>
      <form className="stack" onSubmit={submit}>
        <Input label={t('auth.email')} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label={t('auth.password')} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {t('auth.login')}
        </button>
        <Link to="/forgot">{t('auth.forgot')}</Link>
      </form>
    </AuthFrame>
  );
}

export function Setup() {
  const { t, lang } = useI18n();
  const s = useSession();
  const [form, setForm] = useState({ shopName: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (s.state === 'in') return <Navigate to="/" replace />;
  if (s.state === 'anon') return <Navigate to="/login" replace />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/setup', { ...form, lang });
      await s.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame title={t('auth.setupTitle')}>
      <p className="muted">{t('auth.setupHelp')}</p>
      <form className="stack" onSubmit={submit}>
        <Input label={t('auth.shopName')} required value={form.shopName} onChange={set('shopName')} />
        <Input label={t('auth.yourName')} required autoComplete="name" value={form.name} onChange={set('name')} />
        <Input label={t('auth.email')} type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        <Input label={t('auth.password')} type="password" required minLength={8} autoComplete="new-password" hint={t('auth.passwordHint')} value={form.password} onChange={set('password')} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {t('auth.create')}
        </button>
      </form>
    </AuthFrame>
  );
}

export function Forgot() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await post('/auth/forgot', { email });
      setMsg(r.message);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <AuthFrame title={t('auth.forgotTitle')}>
      <p className="muted">{t('auth.forgotHelp')}</p>
      <form className="stack" onSubmit={submit}>
        <Input label={t('auth.email')} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {msg && <p className="okmsg">{msg}</p>}
        {error && <p className="error">{error}</p>}
        <button className="btn primary block">{t('auth.sendLink')}</button>
        <Link to="/login">{t('app.back')}</Link>
      </form>
    </AuthFrame>
  );
}

export function Reset() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await post('/auth/reset', { token: params.get('token') ?? '', password });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <AuthFrame title={t('auth.resetTitle')}>
      {done ? (
        <>
          <p className="okmsg">{t('auth.resetDone')}</p>
          <Link className="btn primary block" to="/login">
            {t('auth.login')}
          </Link>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          <Input label={t('auth.newPassword')} type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button className="btn primary block">{t('common.save')}</button>
        </form>
      )}
    </AuthFrame>
  );
}
