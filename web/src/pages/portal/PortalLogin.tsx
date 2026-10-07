import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { post } from '../../api';
import { LangSwitch } from '../../App';
import { Input } from '../../components/ui';
import { useI18n } from '../../i18n';

/** El cliente pide un enlace nuevo con su teléfono o correo y un código de 6 dígitos. */
export function PortalLogin() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [contact, setContact] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState('');
  const [error, setError] = useState('');

  async function request(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await post('/portal/request-code', { contact });
      setSent(r.message);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const r = await post('/portal/verify-code', { contact, code });
      nav(`/p/${r.token}`, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="auth">
      <div className="auth-box">
        <div className="row between">
          <h1>{t('portal.loginTitle')}</h1>
          <LangSwitch />
        </div>
        <p className="muted">{t('portal.loginHelp')}</p>
        {!sent ? (
          <form className="stack" onSubmit={request}>
            <Input label={t('portal.contact')} required value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="tel" />
            <button className="btn primary block">{t('portal.sendCode')}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={verify}>
            <p className="okmsg">{sent}</p>
            <Input label={t('portal.code')} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn primary block">{t('portal.verify')}</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
