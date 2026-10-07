import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { post } from '../api';
import { IconMap, IconPhone, IconTruck } from '../components/icons';
import { ManualList } from '../components/Outbox';
import { Empty, LoadError, Loading, mapsUrl, Sheet, Status, Tag, telUrl, useAction, useLoad, vehicleName } from '../components/ui';
import { useI18n, type Key } from '../i18n';

export function Today() {
  const { t, f } = useI18n();
  const { data, error, loading, reload } = useLoad('/dashboard');
  const manual = useLoad<any[]>('/notifications/manual');
  useEffect(() => {
    const h = () => setTimeout(() => void manual.reload(), 400);
    window.addEventListener('tp:action-done', h);
    return () => window.removeEventListener('tp:action-done', h);
  }, [manual.reload]);
  const [otw, setOtw] = useState<any>(null);
  const { run, busy } = useAction();

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  const d = data!;
  const openCount = d.byStatus.reduce((s: number, x: any) => s + x.n, 0);

  async function sendOtw(eta: number) {
    await run(() => post(`/visits/${otw.id}/on-the-way`, { eta_minutes: eta }), t('today.onTheWaySent'));
    setOtw(null);
    void reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('today.title')}</h1>
          <p className="muted">{f.dayLong(new Date())}</p>
        </div>
      </div>

      {manual.data && manual.data.length > 0 && (
        <section className="section">
          <h2>{t('today.manual', { n: manual.data.length })}</h2>
          <p className="muted small">{t('outbox.help')}</p>
          <ManualList items={manual.data} onChange={() => void manual.reload()} />
        </section>
      )}

      <section className="section" aria-label={t('nav.agenda')}>
        {d.visitsToday.length === 0 ? (
          <Empty>
            {t('today.noVisits')} <Link to="/agenda">{t('agenda.new')}</Link>
          </Empty>
        ) : (
          <div className="panel day">
            {d.visitsToday.map((v: any) => (
              <article className="visit" key={v.id}>
                <div className="when">
                  {f.time(v.scheduled_start)}
                  <small>{t(`agenda.purpose.${v.purpose}` as Key)}</small>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  <div className="item-top">
                    <strong className="item-title">{v.client_name}</strong>
                    <Status value={v.status} label={t(`agenda.status.${v.status}` as Key)} />
                  </div>
                  <p className="muted small">
                    {vehicleName(v)}
                    {vehicleName(v) && v.address ? ' — ' : ''}
                    {v.address}
                  </p>
                  <div className="row">
                    {v.order_id ? (
                      <Link className="btn primary small" to={`/orders/${v.order_id}`}>
                        {t('today.openOrder', { n: v.order_number })}
                      </Link>
                    ) : (
                      <Link className="btn primary small" to={`/intake?visit=${v.id}&client=${v.client_id}`}>
                        {t('today.startIntake')}
                      </Link>
                    )}
                    {['scheduled', 'on_the_way'].includes(v.status) && (
                      <button className="btn small" onClick={() => setOtw(v)}>
                        <IconTruck />
                        {t('today.onTheWay')}
                      </button>
                    )}
                    <a className="btn small" href={mapsUrl(v.address)} target="_blank" rel="noreferrer">
                      <IconMap />
                      <span className="sr-only">{t('common.openMap')}</span>
                    </a>
                    {v.client_phone && (
                      <a className="btn small" href={telUrl(v.client_phone)}>
                        <IconPhone />
                        <span className="sr-only">{t('common.call')}</span>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {d.money && (
        <div className="figures">
          <div>
            <strong>{f.money(d.money.today)}</strong>
            <span>{t('today.moneyToday')}</span>
          </div>
          <div>
            <strong>{f.money(d.money.month)}</strong>
            <span>{t('today.moneyMonth')}</span>
          </div>
          <div>
            <strong>{f.money(d.money.receivable)}</strong>
            <span>{t('today.receivable')}</span>
          </div>
        </div>
      )}

      {d.failedNotifications > 0 && (
        <p className="error">
          {t('today.failed', { n: d.failedNotifications })} <Link to="/more/notifications">{t('today.seeNotifications')}</Link>
        </p>
      )}

      {d.messages.length > 0 && (
        <section className="section">
          <h2>{t('today.messages')}</h2>
          <ul className="list">
            {d.messages.map((m: any) => (
              <li key={m.id}>
                <Link className="item" to={m.order_id ? `/orders/${m.order_id}` : '/clients'}>
                  <div className="item-top">
                    <strong>{m.client_name}</strong>
                    <span className="muted small">{f.dateTime(m.created_at)}</span>
                  </div>
                  <p>{m.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.pendingQuotes.length > 0 && (
        <section className="section">
          <h2>{t('today.waitingQuotes')}</h2>
          <ul className="list">
            {d.pendingQuotes.map((q: any) => (
              <li key={q.id}>
                <Link className="item" to={`/orders/${q.order_id}`}>
                  <div className="item-top">
                    <span className="row">
                      <Tag>{q.number}</Tag> {q.client_name}
                    </span>
                    <strong>{f.money(q.total_cents)}</strong>
                  </div>
                  <span className="muted small">{f.dateTime(q.sent_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.readyOld.length > 0 && (
        <section className="section">
          <h2>{t('today.readyPickup')}</h2>
          <ul className="list">
            {d.readyOld.map((o: any) => (
              <li key={o.id}>
                <Link className="item" to={`/orders/${o.id}`}>
                  <div className="item-top">
                    <span className="row">
                      <Tag>{o.number}</Tag> {o.client_name}
                    </span>
                    <span className="muted small">{f.dateTime(o.ready_since)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted small">
        <Link to="/orders">
          {t('today.openOrders')}: {openCount}
        </Link>
      </p>

      <Sheet open={Boolean(otw)} onClose={() => setOtw(null)} title={t('today.onTheWay')}>
        <p className="muted">{otw?.client_name}</p>
        <p>{t('today.eta')}</p>
        <div className="grid3">
          {[10, 20, 30, 45, 60, 90].map((m) => (
            <button key={m} className="btn" disabled={busy} onClick={() => sendOtw(m)}>
              {m} min
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
