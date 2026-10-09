import { useCallback, useEffect, useRef, useState } from 'react';
import { get, post } from '../api';
import { useI18n, type Key } from '../i18n';
import { Sheet } from './ui';

/** Enlace que abre WhatsApp con el mensaje ya escrito. */
export function whatsappUrl(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** Enlace que abre la app de mensajes (Android e iPhone aceptan «?&body=»). */
export function smsUrl(phone: string, text: string) {
  return `sms:${phone}?&body=${encodeURIComponent(text)}`;
}

/** Lista de avisos preparados: WhatsApp o SMS desde el celular del dueño, sin costo. */
export function ManualList({ items, onChange }: { items: any[]; onChange: () => void }) {
  const { t, f } = useI18n();
  async function mark(id: string, result: 'sent' | 'skipped', channel?: 'sms' | 'whatsapp' | 'email') {
    await post(`/notifications/${id}/manual`, { result, channel }).catch(() => {});
    onChange();
  }
  return (
    <ul className="list">
      {items.map((n) => (
        <li key={n.id} className="item" style={{ gap: 8 }}>
          <div className="item-top">
            <strong>
              {n.client_name} <span className="muted small">→ {n.to_address}</span>
            </strong>
            <span className="muted small">
              {t(`templates.event.${n.event}` as Key)}
              {n.order_number ? ` — ${n.order_number}` : ''}
            </span>
          </div>
          <p className="small" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {n.body}
          </p>
          <div className="row">
            {n.channel === 'email' ? (
              <a
                className="btn primary small"
                href={`mailto:${n.to_address}?subject=${encodeURIComponent(n.subject ?? '')}&body=${encodeURIComponent(n.body)}`}
                onClick={() => void mark(n.id, 'sent', 'email')}
              >
                {t('outbox.email')}
              </a>
            ) : (
              <>
                <a className="btn primary small" href={whatsappUrl(n.to_address, n.body)} target="_blank" rel="noreferrer" onClick={() => void mark(n.id, 'sent', 'whatsapp')}>
                  {t('outbox.whatsapp')}
                </a>
                <a className="btn small" href={smsUrl(n.to_address, n.body)} onClick={() => void mark(n.id, 'sent', 'sms')}>
                  {t('outbox.sms')}
                </a>
              </>
            )}
            <button className="btn ghost small" onClick={() => void mark(n.id, 'skipped')}>
              {t('outbox.skip')}
            </button>
            <span className="muted small">{f.dateTime(n.created_at)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Después de cada acción (enviar cotización, «voy en camino», marcar listo…), si la app preparó
 * avisos nuevos para enviar a mano, los muestra enseguida para enviarlos con un toque.
 */
export function OutboxPrompt() {
  const { t } = useI18n();
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<any[]>([]);

  const check = useCallback(async () => {
    const list: any[] = await get('/notifications/manual').catch(() => []);
    if (known.current === null) {
      known.current = new Set(list.map((n) => n.id));
      return;
    }
    const added = list.filter((n) => !known.current!.has(n.id));
    list.forEach((n) => known.current!.add(n.id));
    const stillPending = new Set(list.map((n) => n.id));
    setFresh((cur) => [...cur.filter((n) => stillPending.has(n.id)), ...added]);
  }, []);

  useEffect(() => {
    void check();
    const h = () => setTimeout(() => void check(), 300);
    window.addEventListener('tp:action-done', h);
    return () => window.removeEventListener('tp:action-done', h);
  }, [check]);

  return (
    <Sheet open={fresh.length > 0} onClose={() => setFresh([])} title={t('outbox.title')}>
      <p className="muted small">{t('outbox.help')}</p>
      <ManualList items={fresh} onChange={() => void check()} />
      <button className="btn" onClick={() => setFresh([])}>
        {t('outbox.later')}
      </button>
    </Sheet>
  );
}
