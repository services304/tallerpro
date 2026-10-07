import { useState } from 'react';
import { post } from '../api';
import { Input, useAction } from '../components/ui';
import { LANGS, useI18n } from '../i18n';
import { useSession } from '../session';

export function Account() {
  const { t, lang, setLang } = useI18n();
  const { user } = useSession();
  const { run, busy } = useAction();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('tallerpro.theme') ?? 'dark';
    } catch {
      return 'dark';
    }
  });
  function applyTheme(v: string) {
    setTheme(v);
    try {
      localStorage.setItem('tallerpro.theme', v);
    } catch {
      /* solo esta sesión */
    }
    if (v === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
  }
  return (
    <>
      <h1>{t('account.title')}</h1>
      <p>
        <strong>{user?.name}</strong> <span className="muted">{user?.email}</span>
      </p>
      <section className="section">
        <h2>{t('common.language')}</h2>
        <div className="seg" role="group" aria-label={t('common.language')}>
          {LANGS.map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
              {t(`lang.${l}`)}
            </button>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>{t('account.theme')}</h2>
        <div className="seg" role="group" aria-label={t('account.theme')}>
          {(['dark', 'light', 'auto'] as const).map((v) => (
            <button key={v} aria-pressed={theme === v} onClick={() => applyTheme(v)}>
              {t(`theme.${v}`)}
            </button>
          ))}
        </div>
      </section>
      <section className="section">
        <h2>{t('account.changePassword')}</h2>
        <Input label={t('account.current')} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        <Input label={t('auth.newPassword')} type="password" minLength={8} autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        <button
          className="btn primary"
          disabled={busy || pw.next.length < 8 || !pw.current}
          onClick={async () => {
            if (await run(() => post('/auth/password', pw), t('account.passwordChanged'))) setPw({ current: '', next: '' });
          }}
        >
          {t('account.changePassword')}
        </button>
      </section>
    </>
  );
}
