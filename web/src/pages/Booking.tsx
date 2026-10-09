import { VehiclePicker } from '../components/VehiclePicker';
import { LocateButton, type Located } from '../components/LocateButton';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { post } from '../api';
import { LangSwitch } from '../App';
import { Lockup } from '../components/Brand';
import { Check, Input, LoadError, Loading, Seg, Sheet, TextArea, useAction, useLoad } from '../components/ui';
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
  const [jobs, setJobs] = useState<string[]>([]);
  const toggleJob = (id: string) => setJobs((j) => (j.includes(id) ? j.filter((x) => x !== id) : [...j, id]));
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', channel: 'sms' as 'sms' | 'whatsapp' | 'email', address: '', make: '', model: '', year: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [location, setLocation] = useState<Located | null>(null);
  const [mode, setMode] = useState<'home' | 'dropoff'>('home');
  const [done, setDone] = useState<null | { start: string }>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const days = slots.data?.days ?? [];
  // Si el día elegido ya no tiene horarios (se recargaron), se vuelve a pedir.
  useEffect(() => {
    if (day && slots.data && !days.some((d) => d.date === day)) (setDay(''), setStart(''));
  }, [days, day, slots.data]);
  const [confirming, setConfirming] = useState(false);
  const [triedSend, setTriedSend] = useState(false);
  const daySlots = useMemo(() => days.find((d) => d.date === day)?.slots ?? [], [days, day]);
  const types = (info.data?.work_types ?? []) as any[];
  const missing =
    !start || form.name.trim().length < 2 || form.phone.trim().length < 7 || (mode === 'home' && form.address.trim().length < 5 && !location) || !form.make.trim() || !form.model.trim() || !consent || (form.channel === 'email' && !form.email.trim());

  async function submit() {
    const r = await run(() =>
      post<{ ok: boolean; start: string }>('/public/booking', {
        work_type_ids: jobs,
        start,
        name: form.name,
        phone: form.phone,
        email: form.email,
        lang,
        channel: form.channel,
        address: form.address,
        location: mode === 'home' && location ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy } : null,
        service_mode: mode,
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
      <p className="muted">{info.data.dropoff_enabled ? t('book.introBoth') : t('book.intro', { fee: f.money(info.data.visit_fee_cents) })}</p>

      <section className="section">
        <h2>1. {t('book.what')}</h2>
        <p className="muted small">{t('book.pickMany')}</p>
        <button type="button" className={`chip ${jobs.length === 0 ? 'on' : ''}`} aria-pressed={jobs.length === 0} onClick={() => setJobs([])}>
          {t('book.notSure')}
        </button>
        {CATS.filter((c) => types.some((w) => w.category === c && w.mode !== 'hourly')).map((c, i) => {
          const list = types.filter((w) => w.category === c && w.mode !== 'hourly');
          const n = list.filter((w) => jobs.includes(w.id)).length;
          return (
            <details key={c} className="jobcat" open={i < 3 || n > 0}>
              <summary>
                {t(`workTypes.cat.${c}` as Key)}
                {n > 0 && <span className="status s-ok">{n}</span>}
              </summary>
              <div className="chips times">
                {list.map((w) => {
                  const on = jobs.includes(w.id);
                  return (
                    <button key={w.id} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggleJob(w.id)}>
                      {on ? '✓ ' : ''}
                      {workName(w, lang)}
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
        {jobs.length > 0 && <p className="muted small">{t('book.picked', { n: jobs.length })}</p>}
      </section>

      <section className="section">
        <h2 id="book-when">2. {t('book.when')}</h2>
        {slots.loading && !slots.data && <Loading />}
        {slots.error && <LoadError error={slots.error} retry={slots.reload} />}
        {slots.data && days.length === 0 && <p className="notice">{t('book.noSlots')}</p>}
        {days.length > 0 && (
          <>
            <p className="step-label">
              <strong>a.</strong> {t('book.pickDay')} <span className="req">*</span>
            </p>
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
            <p className="step-label">
              <strong>b.</strong> {t('book.pickTime')} <span className="req">*</span>
            </p>
            {!day ? (
              <p className="muted small">{t('book.dayFirst')}</p>
            ) : (
              <div className="chips times" role="listbox" aria-label={t('book.time')}>
                {daySlots.map((x) => (
                  <button key={x} type="button" role="option" aria-selected={x === start} className={`chip ${x === start ? 'on' : ''}`} onClick={() => setStart(x)}>
                    {f.time(x)}
                  </button>
                ))}
              </div>
            )}
            {start ? (
              <div className="confirm-banner" role="status">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{t('book.yourSlot')}</strong>
                  <br />
                  {f.dayLong(start)} — {f.time(start)}
                </div>
              </div>
            ) : (
              triedSend && <p className="error small">{day ? t('book.needTime') : t('book.needDay')}</p>
            )}
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
        {info.data.dropoff_enabled && (
          <div className="stack" style={{ gap: 6 }}>
            <strong>{t('book.where')}</strong>
            <div className="mode-pick">
              <button type="button" className={`mode ${mode === 'home' ? 'on' : ''}`} aria-pressed={mode === 'home'} onClick={() => setMode('home')}>
                <strong>{t('book.modeHome')}</strong>
                <span>{t('book.modeHomeHelp', { fee: f.money(info.data.visit_fee_cents) })}</span>
              </button>
              <button type="button" className={`mode ${mode === 'dropoff' ? 'on' : ''}`} aria-pressed={mode === 'dropoff'} onClick={() => setMode('dropoff')}>
                <strong>{t('book.modeDropoff')}</strong>
                <span>{t('book.modeDropoffHelp', { fee: f.money(info.data.dropoff_fee_cents) })}</span>
              </button>
            </div>
          </div>
        )}
        {mode === 'home' ? (
          <>
            <p className="muted small">{t('loc.why')}</p>
            <LocateButton
              value={location}
              onLocated={(l) => {
                setLocation(l);
                if (l?.address && !form.address.trim()) setForm((f) => ({ ...f, address: l.address! }));
              }}
            />
            <Input label={t('book.address')} autoComplete="street-address" value={form.address} onChange={set('address')} hint={location ? t('loc.checkAddress') : t('book.addressHint')} />
          </>
        ) : (
          <p className="notice">{info.data.shop_address ? t('book.dropoffAt', { a: info.data.shop_address }) : t('book.dropoffLater')}</p>
        )}
      </section>

      <section className="section">
        <h2>4. {t('book.car')}</h2>
        <VehiclePicker make={form.make} model={form.model} year={form.year} yearOptional onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
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
      <button
        className="btn primary big"
        disabled={busy}
        onClick={() => {
          setTriedSend(true);
          if (!start) return document.getElementById('book-when')?.scrollIntoView({ behavior: 'smooth' });
          if (!missing) setConfirming(true);
        }}
      >
        {t('book.send')}
      </button>
      <Sheet open={confirming} onClose={() => setConfirming(false)} title={t('book.confirmTitle')}>
        {start && (
          <div className="stack">
            <div className="confirm-banner">
              <span aria-hidden="true">📅</span>
              <div>
                <strong>
                  {f.dayLong(start)} — {f.time(start)}
                </strong>
              </div>
            </div>
            <dl className="summary">
              <dt>{t('book.what')}</dt>
              <dd>{jobs.length ? types.filter((w) => jobs.includes(w.id)).map((w) => workName(w, lang)).join(', ') : t('book.notSure')}</dd>
              <dt>{t('book.where')}</dt>
              <dd>
                {mode === 'home'
                  ? `${t('book.modeHome')} — ${form.address || (location ? t('loc.saved', { m: location.accuracy }) : '')}`
                  : `${t('book.modeDropoff')}${info.data.shop_address ? ` — ${info.data.shop_address}` : ''}`}
              </dd>
              <dt>{t('book.car')}</dt>
              <dd>{[form.make, form.model, form.year].filter(Boolean).join(' ')}</dd>
              <dt>{t('book.you')}</dt>
              <dd>
                {form.name} — {form.phone}
              </dd>
            </dl>
            <p className="muted small">{mode === 'home' ? t('book.confirmHelp', { fee: f.money(info.data.visit_fee_cents) }) : t('book.confirmHelpDropoff', { fee: f.money(info.data.dropoff_fee_cents) })}</p>
            <button
              className="btn primary big"
              disabled={busy}
              onClick={async () => {
                setConfirming(false);
                await submit();
              }}
            >
              {t('book.confirmSend')}
            </button>
            <button className="btn ghost" onClick={() => setConfirming(false)}>
              {t('book.edit')}
            </button>
          </div>
        )}
      </Sheet>
      {missing && <p className="muted small">{t('book.fillAll')}</p>}
    </div>
  );
}
