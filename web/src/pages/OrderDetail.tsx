import { ClientLinkButton } from '../components/ClientLink';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { post } from '../api';
import { IconMap, IconPhone } from '../components/icons';
import { Check, LoadError, Loading, mapsUrl, OrderStatus, Sheet, Tag, telUrl, TextArea, useAction, useLoad, vehicleName } from '../components/ui';
import { useI18n, type Key } from '../i18n';
import { onUploaded } from '../uploadQueue';
import { WorkTab } from './order/WorkTab';
import { PhotosTab } from './order/PhotosTab';
import { QuoteTab } from './order/QuoteTab';
import { InvoiceTab } from './order/InvoiceTab';
import { HistoryTab } from './order/HistoryTab';

type TabKey = 'work' | 'photos' | 'quote' | 'invoice' | 'history';

/** Pestaña que tiene más sentido según el estado de la orden. */
function defaultTab(status: string): TabKey {
  if (['quote_sent'].includes(status)) return 'quote';
  if (['ready', 'delivered', 'rejected'].includes(status)) return 'invoice';
  return 'work';
}

export function OrderDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad(`/orders/${id}`);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [move, setMove] = useState<string | null>(null);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState('');
  const { run, busy } = useAction();

  useEffect(() => onUploaded((orderId) => orderId === id && void reload()), [id, reload]);

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  const d = data!;
  const o = d.order;
  const current = tab ?? defaultTab(o.status);
  const notifies = ['waiting_parts', 'ready', 'delivered'].includes(move ?? '');

  async function doMove() {
    const r = await run(() => post(`/orders/${id}/status`, { to: move, notify, note }), t('common.saved'));
    if (r) {
      setMove(null);
      setNote('');
      void reload();
    }
  }

  const tabs: TabKey[] = ['work', 'photos', 'quote', 'invoice', 'history'];

  return (
    <>
      <header className="stack" style={{ gap: 10 }}>
        <div className="row between">
          <Tag big>{o.number}</Tag>
          <OrderStatus status={o.status} />
        </div>
        <div className="row between">
          <div>
            <Link to={`/clients/${d.client.id}`} className="item-title" style={{ color: 'inherit' }}>
              {d.client.name}
            </Link>
            <p className="muted">
              {[vehicleName(d.vehicle), d.vehicle.plate, d.vehicle.color].filter(Boolean).join(' — ')}
            </p>
          </div>
          <div className="row">
            <ClientLinkButton orderId={o.id} hasPendingQuote={d.quotes?.some((q: any) => q.status === 'sent')} />
            {d.client.phone && (
              <a className="btn small" href={telUrl(d.client.phone)}>
                <IconPhone />
                <span className="sr-only">{t('common.call')}</span>
              </a>
            )}
            {o.service_address && (
              <a className="btn small" href={mapsUrl(o.service_address)} target="_blank" rel="noreferrer">
                <IconMap />
                <span className="sr-only">{t('common.openMap')}</span>
              </a>
            )}
          </div>
        </div>
        {d.allowed.length > 0 && (
          <div className="row">
            {d.allowed.map((s: string) => (
              <button key={s} className={`btn small${s === 'cancelled' ? ' danger' : s === d.allowed[0] ? ' primary' : ''}`} onClick={() => (setMove(s), setNotify(true))}>
                {t(`move.${s}` as Key)}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="tabs" role="tablist">
        {tabs.map((k) => (
          <button key={k} role="tab" aria-selected={current === k} onClick={() => setTab(k)}>
            {t(`order.tab.${k}` as Key)}
            {k === 'photos' && d.photos.length > 0 ? ` (${d.photos.length})` : ''}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="stack" style={{ gap: 20 }}>
        {current === 'work' && <WorkTab d={d} reload={reload} />}
        {current === 'photos' && <PhotosTab d={d} reload={reload} />}
        {current === 'quote' && <QuoteTab d={d} reload={reload} />}
        {current === 'invoice' && <InvoiceTab d={d} reload={reload} />}
        {current === 'history' && <HistoryTab d={d} />}
      </div>

      <Sheet open={Boolean(move)} onClose={() => setMove(null)} title={move ? t(`move.${move}` as Key) : ''}>
        <p>
          <OrderStatus status={o.status} /> → <OrderStatus status={move ?? o.status} />
        </p>
        <TextArea label={`${t('common.notes')} (${t('common.optional')})`} value={note} onChange={(e) => setNote(e.target.value)} />
        {notifies && <Check label={t('move.notify')} checked={notify} onChange={setNotify} />}
        <button className={`btn ${move === 'cancelled' ? 'danger' : 'primary'}`} disabled={busy} onClick={doMove}>
          {move ? t(`move.${move}` as Key) : ''}
        </button>
      </Sheet>
    </>
  );
}
