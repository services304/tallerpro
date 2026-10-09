import { useState } from 'react';
import { post } from '../api';
import { useI18n } from '../i18n';
import { Sheet, TextArea, useAction, useToast } from './ui';

type LinkInfo = { url: string; message: string; phone: string | null; email: string | null; pending: number };

/** Botón «Enlace del cliente»: crea el enlace al portal y lo manda por WhatsApp, SMS o correo (o se copia). */
export function ClientLinkButton({ orderId, hasPendingQuote }: { orderId: string; hasPendingQuote?: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const { run, busy } = useAction();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [text, setText] = useState('');

  async function open() {
    const r = await run(() => post<LinkInfo>(`/orders/${orderId}/portal-link`, {}));
    if (r) {
      setInfo(r);
      setText(r.message);
    }
  }
  const digits = info?.phone?.replace(/\D/g, '') ?? '';

  return (
    <>
      <button className={`btn small${hasPendingQuote ? ' primary' : ''}`} disabled={busy} onClick={open}>
        {t('clink.button')}
      </button>
      <Sheet open={Boolean(info)} onClose={() => setInfo(null)} title={t('clink.title')}>
        {info && (
          <div className="stack">
            <p className="muted small">{info.pending ? t('clink.helpPending') : t('clink.help')}</p>
            <TextArea label={t('clink.message')} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="grid2">
              {digits && (
                <a className="btn primary" href={`https://wa.me/${digits}?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
                  WhatsApp
                </a>
              )}
              {info.phone && (
                <a className="btn" href={`sms:${info.phone}${/iP(hone|ad)/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(text)}`}>
                  SMS
                </a>
              )}
              {info.email && (
                <a className="btn" href={`mailto:${info.email}?subject=${encodeURIComponent(t('clink.subject'))}&body=${encodeURIComponent(text)}`}>
                  {t('common.email')}
                </a>
              )}
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text);
                    toast(t('bookset.copied'));
                  } catch {
                    /* copiar a mano */
                  }
                }}
              >
                {t('clink.copy')}
              </button>
            </div>
            <a className="btn ghost small" href={info.url} target="_blank" rel="noreferrer">
              {t('clink.preview')}
            </a>
            <p className="muted small">{t('clink.validity')}</p>
          </div>
        )}
      </Sheet>
    </>
  );
}
