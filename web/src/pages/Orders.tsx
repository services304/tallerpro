import { useState } from 'react';
import { Link } from 'react-router';
import { Empty, LoadError, Loading, OrderStatus, Seg, Tag, useLoad, vehicleName } from '../components/ui';
import { useI18n } from '../i18n';

export function Orders() {
  const { t, f } = useI18n();
  const [scope, setScope] = useState<'1' | 'all'>('1');
  const [q, setQ] = useState('');
  const path = `/orders?${scope === '1' ? 'open=1&' : ''}${q ? `q=${encodeURIComponent(q)}` : ''}`;
  const { data, error, loading, reload } = useLoad<any[]>(path);

  return (
    <>
      <div className="page-head">
        <h1>{t('orders.title')}</h1>
        <Link className="btn" to="/intake">
          {t('orders.newIntake')}
        </Link>
      </div>
      <div className="row between">
        <Seg label={t('orders.title')} value={scope} onChange={setScope} options={[{ value: '1', label: t('orders.open') }, { value: 'all', label: t('orders.all') }]} />
        <input type="search" style={{ flex: 1, minWidth: 180 }} placeholder={t('orders.searchHint')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} retry={reload} />}
      {data && data.length === 0 && <Empty>{t('orders.empty')}</Empty>}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((o) => (
            <li key={o.id}>
              <Link className="item" to={`/orders/${o.id}`}>
                <div className="item-top">
                  <Tag>{o.number}</Tag>
                  <OrderStatus status={o.status} />
                </div>
                <div className="item-top">
                  <span className="item-title">{o.client_name}</span>
                  <span className="muted small">{f.money(o.lines_subtotal_cents)}</span>
                </div>
                <span className="muted small">
                  {[vehicleName(o), o.plate].filter(Boolean).join(' — ')}
                  {o.next_visit ? ` — ${f.dayShort(o.next_visit)} ${f.time(o.next_visit)}` : ''}
                  {o.promised_at ? ` — ${t('orders.promised', { d: f.dayShort(o.promised_at) })}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
