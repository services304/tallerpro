import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { del, post } from '../api';
import { ClientForm, emptyVehicle, VehicleFields, vehicleBody } from '../components/forms';
import { IconMap, IconPhone } from '../components/icons';
import { Check, Empty, LoadError, Loading, mapsUrl, OrderStatus, Sheet, Status, Tag, telUrl, useAction, useLoad, useToast, vehicleName } from '../components/ui';
import { useI18n, type Key } from '../i18n';
import { useSession } from '../session';

export function Clients() {
  const { t, f } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useLoad<any[]>(`/clients?q=${encodeURIComponent(q)}`);
  return (
    <>
      <div className="page-head">
        <h1>{t('clients.title')}</h1>
        <button className="btn primary" onClick={() => setCreating(true)}>
          {t('clients.new')}
        </button>
      </div>
      <input type="search" placeholder={t('intake.findClient')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && !data && <Loading />}
      {error && <LoadError error={error} retry={reload} />}
      {data && data.length === 0 && !q && <Empty>{t('clients.empty')}</Empty>}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((c) => (
            <li key={c.id}>
              <Link className="item" to={`/clients/${c.id}`}>
                <div className="item-top">
                  <span className="item-title">
                    {c.name} {c.is_sample && <span className="status s-off">{t('samples.tag')}</span>}
                  </span>
                  {c.balance_cents > 0 && <span className="status s-wait">{f.money(c.balance_cents)}</span>}
                </div>
                <span className="muted small">{[c.phone, c.email].filter(Boolean).join(' — ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!q && <SamplesPanel count={data?.filter((c) => c.is_sample).length ?? 0} total={data?.length ?? 0} reload={reload} />}
      <Sheet open={creating} onClose={() => setCreating(false)} title={t('clients.new')}>
        <ClientForm onSaved={(id) => nav(`/clients/${id}`)} />
      </Sheet>
    </>
  );
}

/** Crear o borrar los clientes de ejemplo (solo el dueño). */
function SamplesPanel({ count, total, reload }: { count: number; total: number; reload: () => void }) {
  const { t } = useI18n();
  const { user } = useSession();
  const toast = useToast();
  const { run, busy } = useAction();
  const [sure, setSure] = useState(false);
  if (user?.role !== 'admin') return null;
  if (count === 0 && total > 0) return null;
  return (
    <div className="panel pad stack">
      {count === 0 ? (
        <>
          <p className="muted">{t('samples.help')}</p>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              const r = await run(() => post<{ created: number }>('/samples/clients', {}));
              if (r) {
                toast(t('samples.created', { n: r.created }));
                reload();
              }
            }}
          >
            {t('samples.create')}
          </button>
        </>
      ) : (
        <>
          <p className="muted">{t('samples.have', { n: count })}</p>
          <button
            className={sure ? 'btn danger' : 'btn'}
            disabled={busy}
            onClick={async () => {
              if (!sure) return setSure(true);
              const r = await run(() => del<{ removed: number }>('/samples/clients'));
              setSure(false);
              if (r) {
                toast(t('samples.removed', { n: r.removed }));
                reload();
              }
            }}
          >
            {sure ? t('samples.confirmDelete') : t('samples.delete')}
          </button>
        </>
      )}
    </div>
  );
}

export function ClientDetail() {
  const { id } = useParams();
  const { t, f } = useI18n();
  const { user } = useSession();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(`/clients/${id}`);
  const [editing, setEditing] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const { run, busy } = useAction();

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  const { client: c, vehicles, orders, invoices, consents, notifications } = data;
  const consent = (k: string) => consents.find((x: any) => x.kind === k)?.granted ?? k === 'service';
  const balance = invoices.filter((i: any) => ['issued', 'partial'].includes(i.status)).reduce((s: number, i: any) => s + i.total_cents - i.paid_cents, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {c.name} {c.is_sample && <span className="status s-off">{t('samples.tag')}</span>}
          </h1>
          <p className="muted">{[c.phone, c.email].filter(Boolean).join(' — ')}</p>
        </div>
        <div className="actions">
          {c.phone && (
            <a className="btn" href={telUrl(c.phone)}>
              <IconPhone />
              <span className="sr-only">{t('common.call')}</span>
            </a>
          )}
          {c.address && (
            <a className="btn" href={mapsUrl(c.address)} target="_blank" rel="noreferrer">
              <IconMap />
              <span className="sr-only">{t('common.openMap')}</span>
            </a>
          )}
          <button className="btn" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </button>
          <Link className="btn primary" to={`/agenda?new=1&client=${c.id}`}>
            {t('clients.schedule')}
          </Link>
        </div>
      </div>
      {c.address && <p>{c.address}</p>}
      {c.notes_internal && <p className="notice">{c.notes_internal}</p>}
      {balance > 0 && (
        <p>
          {t('clients.balance')}: <strong>{f.money(balance)}</strong>
        </p>
      )}

      <section className="section">
        <div className="row between">
          <h2>{t('clients.vehicles')}</h2>
          <button className="btn small" onClick={() => (setVehicle(emptyVehicle), setAddingVehicle(true))}>
            + {t('clients.addVehicle')}
          </button>
        </div>
        {vehicles.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <ul className="list">
            {vehicles.map((v: any) => (
              <li key={v.id} className="item">
                <span className="item-title">{vehicleName(v) || v.vin}</span>
                <span className="muted small">
                  {[v.plate, v.vin, v.last_odometer ? `${f.number(v.last_odometer)} km` : ''].filter(Boolean).join(' — ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <h2>{t('clients.orders')}</h2>
        {orders.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <ul className="list">
            {orders.map((o: any) => (
              <li key={o.id}>
                <Link className="item" to={`/orders/${o.id}`}>
                  <div className="item-top">
                    <Tag>{o.number}</Tag>
                    <OrderStatus status={o.status} />
                  </div>
                  <span className="muted small">
                    {f.date(o.created_at)} — {vehicleName(o)} {o.reason && `— ${o.reason}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {invoices.length > 0 && (
        <section className="section">
          <h2>{t('clients.invoices')}</h2>
          <ul className="list">
            {invoices.map((i: any) => (
              <li key={i.id}>
                <a className="item" href={`/api/invoices/${i.id}/pdf?lang=fr`} target="_blank" rel="noreferrer">
                  <div className="item-top">
                    <span>{t('invoice.number', { n: i.number })}</span>
                    <Status value={i.status} label={t(`invoice.status.${i.status}` as Key)} />
                  </div>
                  <span className="muted small">
                    {f.date(i.issued_at)} — {f.money(i.total_cents)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>{t('clients.consents')}</h2>
        <div className="panel pad">
          {(['service', 'maintenance', 'promo'] as const).map((k) => (
            <Check
              key={k}
              label={t(`clients.consent.${k}` as Key)}
              checked={consent(k)}
              onChange={async (granted) => (await run(() => post(`/clients/${c.id}/consents`, { kind: k, granted }))) && reload()}
            />
          ))}
        </div>
      </section>

      {notifications.length > 0 && (
        <section className="section">
          <h2>{t('clients.notifications')}</h2>
          <ul className="list">
            {notifications.slice(0, 10).map((n: any) => (
              <li key={n.id} className="item">
                <div className="item-top">
                  <span>{t(`templates.event.${n.event}` as Key)}</span>
                  <Status value={n.status} label={t(`notifications.status.${n.status}` as Key)} />
                </div>
                <span className="muted small">
                  {t(`clients.channel.${n.channel}` as Key)} — {f.dateTime(n.created_at)}
                  {n.error && ` — ${n.error}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="row">
        <a className="btn small" href={`/api/clients/${c.id}/export`} download>
          {t('clients.export')}
        </a>
        {user?.role === 'admin' && (
          <button
            className="btn small danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm(t('clients.anonymizeConfirm'))) return;
              if (await run(() => post(`/clients/${c.id}/anonymize`), t('common.saved'))) nav('/clients');
            }}
          >
            {t('clients.anonymize')}
          </button>
        )}
      </section>

      <Sheet open={editing} onClose={() => setEditing(false)} title={t('common.edit')}>
        <ClientForm
          initial={{ ...c, phone: c.phone ?? '', email: c.email ?? '' }}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      </Sheet>

      <Sheet open={addingVehicle} onClose={() => setAddingVehicle(false)} title={t('clients.addVehicle')}>
        <VehicleFields v={vehicle} onChange={setVehicle} />
        <button
          className="btn primary"
          disabled={busy || !(vehicle.make || vehicle.vin || vehicle.plate)}
          onClick={async () => {
            if (await run(() => post('/vehicles', { client_id: c.id, ...vehicleBody(vehicle) }), t('common.saved'))) {
              setAddingVehicle(false);
              reload();
            }
          }}
        >
          {t('common.save')}
        </button>
      </Sheet>
    </>
  );
}
