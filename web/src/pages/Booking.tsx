import { LocateButton, type Located } from '../components/LocateButton';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { post } from '../api';
import { LangSwitch } from '../App';
import { Lockup } from '../components/Brand';
import { Check, Input, LoadError, Loading, Seg, Select, TextArea, useAction, useLoad } from '../components/ui';
import { useI18n, type Key } from '../i18n';

const CATS = ['maintenance', 'tires', 'brakes', 'electrical', 'engine', 'suspension', 'exhaust', 'climate', 'other'] as const;

function workName(w: any, lang: string) {
  const n = w?.names ?? {};
  return n[lang] || n.fr || n.es || n.en || w?.name || '';
}

/** Página pública: el cliente pide una visita a domicilio. Llega a la agenda del taller como «por confirmar». */
export function Booking() {
  const { t, f, lang } = useI18n();
  const info = useLoad<any>('/public/booking');
  const slots = useLoad<{ days: { date: string; slots: string[] }[] }>('/public/booking/slots');
  const { run, busy } = useAction();
  const [workType, setWorkType] = useState('');
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', channel: 'sms' as 'sms' | 'whatsapp' | 'email', address: '', make: '', model: '', year: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [location, setLocation] = useState<Located | null>(null);
  const [done, setDone] = useState<null | { start: string }>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const days = slots.data?.days ?? [];
  useEffect(() => {
    if (!day && days.length) setDay(days[0]!.date);
  }, [days, day]);
  const daySlots = useMemo(() => days.find((d) => d.date === day)?.slots ?? [], [days, day]);
  const types = (info.data?.work_types ?? []) as any[];
  const missing =
    !start || form.name.trim().length < 2 || form.phone.trim().length < 7 || (form.address.trim().length < 5 && !location) || !form.make.trim() || !form.model.trim() || !consent || (form.channel === 'email' && !form.email.trim());

  async function submit() {
    const r = await run(() =>
      post<{ ok: boolean; start: string }>('/public/booking', {
        work_type_id: workType || null,
        start,
        name: form.name,
        phone: form.phone,
        email: form.email,
        lang,
        channel: form.channel,
        address: form.address,
        location: location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : null,
        make: form.make,
        model: form.model,
        year: form.year ? Number(form.year) : null,
        message: form.message,
        consent: true,
        website: form.website,
      }),
    );
    if (r) setDone({ start: r.start });
    else {
      // El horario pudo ocuparse mientras tanto: se recargan los horarios.
      setStart('');
      slots.reload();
    }
  }

  const head = (
    <div className="row between booking-head">
      <Lockup />
      <LangSwitch />
    </div>
  );

  if (info.loading && !info.data) return <div className="main booking">{head}<Loading /></div>;
  if (info.error) return <div className="main booking">{head}<LoadError error={info.error} retry={info.reload} /></div>;

  if (done) {
    return (
      <div className="main booking">
        {head}
        <section className="panel pad stack booking-done">
          <h1>{t('book.thanks')}</h1>
          <p>{t('book.received', { when: `${f.dayLong(done.start)} — ${f.time(done.start)}` })}</p>
          <p className="muted">{t(`book.confirmVia.${form.channel}` as Key)}</p>
          {info.data.shop_phone && (
            <p className="muted small">
              {t('book.questions')} <a href={`tel:${info.data.shop_phone}`}>{info.data.shop_phone}</a>
            </p>
          )}
        </section>
      </div>
    );
  }

  if (!info.data.enabled) {
    return (
      <div className="main booking">
        {head}
        <p className="notice">{t('book.closed')}</p>
        {info.data.shop_phone && (
          <a className="btn primary" href={`tel:${info.data.shop_phone}`}>
            {t('book.call')} {info.data.shop_phone}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="main booking">
      {head}
      <h1>{t('book.title')}</h1>
      <p className="muted">{t('book.intro', { fee: f.money(info.data.visit_fee_cents) })}</p>

      <section className="section">
        <h2>1. {t('book.what')}</h2>
        <Select label={t('book.job')} value={workType} onChange={(e) => setWorkType(e.target.value)}>
          <option value="">{t('book.notSure')}</option>
          {CATS.filter((c) => types.some((w) => w.category === c)).map((c) => (
            <optgroup key={c} label={t(`workTypes.cat.${c}` as Key)}>
              {types
                .filter((w) => w.category === c)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {workName(w, lang)}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </section>

      <section className="section">
        <h2>2. {t('book.when')}</h2>
        {slots.loading && !slots.data && <Loading />}
        {slots.error && <LoadError error={slots.error} retry={slots.reload} />}
        {slots.data && days.length === 0 && <p className="notice">{t('book.noSlots')}</p>}
        {days.length > 0 && (
          <>
            <div className="chips" role="listbox" aria-label={t('book.day')}>
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  role="option"
                  aria-selected={d.date === day}
                  className={`chip ${d.date === day ? 'on' : ''}`}
                  onClick={() => (setDay(d.date), setStart(''))}
                >
                  {f.dayShort(d.slots[0]!)}
                </button>
              ))}
            </div>
            <div className="chips times" role="listbox" aria-label={t('book.time')}>
              {daySlots.map((s) => (
                <button key={s} type="button" role="option" aria-selected={s === start} className={`chip ${s === start ? 'on' : ''}`} onClick={() => setStart(s)}>
                  {f.time(s)}
                </button>
              ))}
            </div>
            {start && <p className="muted small">{t('book.chosen', { when: `${f.dayLong(start)} — ${f.time(start)}` })}</p>}
          </>
        )}
      </section>

      <section className="section">
        <h2>3. {t('book.you')}</h2>
        <Input label={t('book.name')} autoComplete="name" value={form.name} onChange={set('name')} />
        <div className="grid2">
          <Input label={t('common.phone')} type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')} />
          <Input label={`${t('common.email')}${form.channel === 'email' ? '' : ` (${t('common.optional')})`}`} type="email" autoComplete="email" value={form.email} onChange={set('email')} />
        </div>
        <Seg
          label={t('book.contactBy')}
          value={form.channel}
          onChange={(channel) => setForm({ ...form, channel })}
          options={[
            { value: 'sms', label: 'SMS' },
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'email', label: t('common.email') },
          ]}
        />
        <p className="muted small">{t('loc.why')}</p>
        <LocateButton
          value={location}
          onLocated={(l) => {
            setLocation(l);
            if (l?.address && !form.address.trim()) setForm((f) => ({ ...f, address: l.address! }));
          }}
        />
        <Input label={t('book.address')} autoComplete="street-address" value={form.address} onChange={set('address')} hint={location ? t('loc.checkAddress') : t('book.addressHint')} />
      </section>

      <section className="section">
        <h2>4. {t('book.car')}</h2>
        <div className="grid3">
          <Input label={t('book.make')} value={form.make} onChange={set('make')} placeholder="Honda" />
          <Input label={t('book.model')} value={form.model} onChange={set('model')} placeholder="Civic" />
          <Input label={`${t('book.year')} (${t('common.optional')})`} inputMode="numeric" value={form.year} onChange={set('year')} placeholder="2018" />
        </div>
        <TextArea label={`${t('book.message')} (${t('common.optional')})`} value={form.message} onChange={set('message')} placeholder={t('book.messageHint')} />
        {/* Trampa para robots: invisible para personas */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hp" aria-hidden="true" />
      </section>

      <Check
        label={
          <>
            {t('book.consent')} <Link to="/privacy">{t('book.privacy')}</Link>
          </>
        }
        checked={consent}
        onChange={setConsent}
      />
      <button className="btn primary big" disabled={busy || missing} onClick={submit}>
        {t('book.send')}
      </button>
      {missing && <p className="muted small">{t('book.fillAll')}</p>}
    </div>
  );
}
