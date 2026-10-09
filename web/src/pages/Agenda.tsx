import { BookingActions } from '../components/BookingActions';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { get, patch, post } from '../api';
import { ClientForm, ClientSearch } from '../components/forms';
import { IconMap } from '../components/icons';
import { Check, Empty, Input, LoadError, Loading, mapsUrl, MoneyInput, Select, Sheet, Status, TextArea, useAction, useLoad, vehicleName } from '../components/ui';
import { useI18n, type Key } from '../i18n';

/** Valor para <input type="datetime-local"> en la hora del teléfono. */
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nextSlot() {
  const d = new Date(Date.now() + 24 * 3600_000);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function VisitForm({ clientId: initialClient, onDone }: { clientId?: string; onDone: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [client, setClient] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const settings = useLoad('/settings');
  const [form, setForm] = useState({
    vehicle_id: '',
    when: toLocalInput(nextSlot()),
    duration: 90,
    purpose: 'diagnosis',
    address: '',
    fee: null as number | null,
    notes: '',
    notify: true,
  });

  useEffect(() => {
    if (initialClient) get(`/clients/${initialClient}`).then((d) => setClient(d.client));
  }, [initialClient]);
  useEffect(() => {
    if (!client) return;
    get(`/clients/${client.id}`).then((d) => {
      setVehicles(d.vehicles);
      setForm((f) => ({ ...f, address: f.address || d.client.address || '', vehicle_id: d.vehicles[0]?.id ?? '' }));
    });
  }, [client]);
  useEffect(() => {
    if (settings.data && form.fee === null) setForm((f) => ({ ...f, fee: settings.data.visit_fee_cents }));
  }, [settings.data, form.fee]);

  if (!client) {
    return creating ? (
      <ClientForm
        onSaved={async (id) => {
          const d = await get(`/clients/${id}`);
          setClient(d.client);
          setCreating(false);
        }}
      />
    ) : (
      <div className="stack">
        <ClientSearch onPick={setClient} />
        <button className="btn" onClick={() => setCreating(true)}>
          {t('intake.newClient')}
        </button>
      </div>
    );
  }

  async function save() {
    const r = await run(
      () =>
        post('/visits', {
          client_id: client.id,
          vehicle_id: form.vehicle_id || null,
          scheduled_start: new Date(form.when).toISOString(),
          duration_minutes: Number(form.duration),
          purpose: form.purpose,
          address: form.address || undefined,
          visit_fee_cents: form.fee ?? undefined,
          notes: form.notes,
          notify: form.notify,
        }),
      t('agenda.created'),
    );
    if (r) onDone();
  }

  return (
    <div className="stack">
      <p>
        <strong>{client.name}</strong> <span className="muted">{client.phone}</span>
      </p>
      {vehicles.length > 0 && (
        <Select label={t('agenda.vehicle')} value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}>
          <option value="">—</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {vehicleName(v)} {v.plate ?? ''}
            </option>
          ))}
        </Select>
      )}
      <div className="grid2">
        <Input label={t('agenda.when')} type="datetime-local" required value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
        <Input label={t('agenda.duration')} type="number" min={15} step={15} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
      </div>
      <Select
        label={t('agenda.purpose')}
        value={form.purpose}
        onChange={(e) => setForm({ ...form, purpose: e.target.value, fee: e.target.value === 'diagnosis' ? settings.data?.visit_fee_cents ?? form.fee : 0 })}
      >
        {(['diagnosis', 'repair', 'other'] as const).map((p) => (
          <option key={p} value={p}>
            {t(`agenda.purpose.${p}` as Key)}
          </option>
        ))}
      </Select>
      <Input label={t('common.address')} hint={t('agenda.addressFromClient')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <MoneyInput label={t('agenda.fee')} hint={t('agenda.feeHelp')} cents={form.fee} onChange={(fee) => setForm({ ...form, fee })} />
      <TextArea label={t('common.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <Check label={t('agenda.notify')} checked={form.notify} onChange={(notify) => setForm({ ...form, notify })} />
      <button className="btn primary" disabled={busy} onClick={save}>
        {t('agenda.new')}
      </button>
    </div>
  );
}

export function Agenda() {
  const { t, f } = useI18n();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useLoad<any[]>('/visits');
  const [edit, setEdit] = useState<any>(null);
  const [when, setWhen] = useState('');
  const { run, busy } = useAction();
  const newFor = params.get('new');

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  const visits = (data ?? []).filter((v) => v.status !== 'cancelled' && new Date(v.scheduled_end) > new Date(Date.now() - 12 * 3600_000));
  const byDay = new Map<string, any[]>();
  for (const v of visits) {
    const k = f.dayLong(v.scheduled_start);
    byDay.set(k, [...(byDay.get(k) ?? []), v]);
  }

  return (
    <>
      <div className="page-head">
        <h1>{t('agenda.title')}</h1>
        <button className="btn primary" onClick={() => setParams({ new: '1' })}>
          {t('agenda.new')}
        </button>
      </div>
      {visits.length === 0 && <Empty>{t('agenda.empty')}</Empty>}
      {[...byDay.entries()].map(([day, list]) => (
        <section className="section" key={day}>
          <h2>{day}</h2>
          <div className="panel day">
            {list.map((v) => (
              <article className="visit" key={v.id}>
                <div className="when">
                  {f.time(v.scheduled_start)}
                  <small>{f.time(v.scheduled_end)}</small>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="item-top">
                    <Link to={`/clients/${v.client_id}`} className="item-title" style={{ color: 'inherit' }}>
                      {v.client_name}
                    </Link>
                    <Status value={v.status} label={t(`agenda.status.${v.status}` as Key)} />
                  </div>
                  <p className="muted small">
                    {[t(`agenda.purpose.${v.purpose}` as Key), vehicleName(v), v.visit_fee_cents > 0 ? f.money(v.visit_fee_cents) : ''].filter(Boolean).join(' — ')}
                  </p>
                  <p className="small">{v.address}</p>
                  {v.status === 'requested' && (
                    <>
                      {v.notes && <p className="small">«{v.notes}»</p>}
                      <p className="muted small">{t('booking.fromOnline')}</p>
                      <BookingActions visit={v} onDone={() => void reload()} />
                    </>
                  )}
                  {v.status !== 'requested' && <div className="row">
                    {v.order_id ? (
                      <Link className="btn small" to={`/orders/${v.order_id}`}>
                        {t('today.openOrder', { n: v.order_number })}
                      </Link>
                    ) : (
                      <Link className="btn small primary" to={`/intake?visit=${v.id}&client=${v.client_id}`}>
                        {t('today.startIntake')}
                      </Link>
                    )}
                    <a className="btn small" href={mapsUrl(v.address)} target="_blank" rel="noreferrer">
                      <IconMap />
                      <span className="sr-only">{t('common.openMap')}</span>
                    </a>
                    {v.status === 'scheduled' && (
                      <button
                        className="btn small"
                        onClick={() => {
                          setEdit(v);
                          setWhen(toLocalInput(new Date(v.scheduled_start)));
                        }}
                      >
                        {t('agenda.reschedule')}
                      </button>
                    )}
                  </div>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <Sheet open={Boolean(newFor)} onClose={() => setParams({})} title={t('agenda.new')}>
        <VisitForm
          clientId={params.get('client') ?? undefined}
          onDone={() => {
            setParams({});
            void reload();
          }}
        />
      </Sheet>

      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={t('agenda.reschedule')}>
        <Input label={t('agenda.when')} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <button
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            await run(() => patch(`/visits/${edit.id}`, { scheduled_start: new Date(when).toISOString() }), t('common.saved'));
            setEdit(null);
            void reload();
          }}
        >
          {t('common.save')}
        </button>
        <button
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm(t('common.confirm'))) return;
            await run(() => patch(`/visits/${edit.id}`, { status: 'cancelled' }));
            setEdit(null);
            void reload();
          }}
        >
          {t('agenda.cancelVisit')}
        </button>
      </Sheet>
    </>
  );
}
