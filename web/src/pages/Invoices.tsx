import { useState } from 'react';
import { Link } from 'react-router';
import { LoadError, Loading, Seg, Status, Tag, useLoad } from '../components/ui';
import { useI18n, type Key } from '../i18n';

export function Invoices() {
  const { t, f } = useI18n();
  const [filter, setFilter] = useState<'unpaid' | 'all'>('unpaid');
  const { data, error, loading, reload } = useLoad<any[]>(`/invoices${filter === 'unpaid' ? '?status=unpaid' : ''}`);
  const total = (data ?? []).filter((i) => ['issued', 'partial'].includes(i.status)).reduce((s, i) => s + i.total_cents - i.paid_cents, 0);
  return (
    <>
      <div className="page-head">
        <h1>{t('invoice.list')}</h1>
        <Seg label={t('invoice.list')} value={filter} onChange={setFilter} options={[{ value: 'unpaid', label: t('invoice.unpaid') }, { value: 'all', label: t('orders.all') }]} />
      </div>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} retry={reload} />}
      {total > 0 && (
        <p>
          {t('today.receivable')}: <strong>{f.money(total)}</strong>
        </p>
      )}
      {data && (
        <ul className="list">
          {data.map((i) => (
            <li key={i.id}>
              <Link className="item" to={i.order_id ? `/orders/${i.order_id}` : '#'}>
                <div className="item-top">
                  <span className="row">
                    <strong>{t('invoice.number', { n: i.number })}</strong>
                    {i.order_number && <Tag>{i.order_number}</Tag>}
                  </span>
                  <Status value={i.status} label={t(`invoice.status.${i.status}` as Key)} />
                </div>
                <div className="item-top">
                  <span>{i.client_name}</span>
                  <strong>{f.money(i.total_cents)}</strong>
                </div>
                <span className="muted small">
                  {f.date(i.issued_at)} — {t(`invoice.kind.${i.kind}` as Key)}
                  {i.paid_cents > 0 && i.status !== 'paid' && ` — ${t('invoice.paid')} ${f.money(i.paid_cents)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
