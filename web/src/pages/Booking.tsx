import { checkEmail, formatLocal7, OTHER_CA_AREA_CODES, QC_AREA_CODES, validLocal7 } from '../lib/contact';
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
  const [knows, setKnows] = useState<null | 'yes' | 'no'>(null);
  const toggleJob = (id: string) => setJobs((j) => (j.includes(id) ? j.filter((x) => x !== id) : [...j, id]));
  const [day, setDay] = useState('');
  const [start, setStart] = useState('');
  const [form, setForm] = useState({ name: '', area: '514', local: '', email: '', channel: 'sms' as 'sms' | 'whatsapp' | 'email', address: '', make: '', model: '', year: '', message: '', website: '' });
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
  const phoneE164 = `+1${form.area}${form.local.replace(/\D/g, '')}`;
  // Qué falta, en el orden de la página (para marcarlo en rojo y llevar al cliente al primero).
  const errors: Record<string, string> = {};
  if (!knows) errors.what = t('book.errWhat');
  else if (knows === 'yes' && jobs.length === 0) errors.what = t('book.errPickJob');
  if (!day) errors.when = t('book.needDay');
  else if (!start) errors.when = t('book.needTime');
  if (form.name.trim().length < 2) errors.name = t('book.errName');
  if (!validLocal7(form.local)) errors.phone = t('book.errPhone7');
  const emailCheck = form.channel === 'email' ? checkEmail(form.email) : null;
  if (emailCheck?.kind === 'invalid') errors.email = t('book.errEmail');
  if (emailCheck?.kind === 'typo') errors.email = t('book.errEmailTypo', { s: emailCheck.suggestion });
  if (mode === 'home' && form.address.trim().length < 5 && !location) errors.address = t('book.errAddress');
  if (!form.make.trim()) errors.make = t('book.errMake');
  if (!form.model.trim()) errors.model = t('book.errModel');
  if (!consent) errors.consent = t('book.errConsent');
  const show = (k: string) => (triedSend ? errors[k] : undefined);
  const ORDER: [string, string][] = [
    ['what', 'f-what'], ['when', 'book-when'], ['name', 'f-name'], ['phone', 'f-phone'], ['email', 'f-email'], ['address', 'f-address'], ['make', 'f-car'], ['model', 'f-car'], ['consent', 'f-consent'],
  ];
  function goToFirstError() {
    const first = ORDER.find(([k]) => errors[k]);
    if (!first) return false;
    const el = document.getElementById(first[1]);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = el?.matches('input,select,textarea') ? el : el?.querySelector<HTMLElement>('input,select,textarea,button');
    setTimeout(() => (input as HTMLElement | null)?.focus({ preventScroll: true }), 350);
    return true;
  }

  async function submit() {
    const r = await run(() =>
      post<{ ok: boolean; start: string }>('/public/booking', {
        work_type_ids: jobs,
        start,
        name: form.name,
        phone: phoneE164,
        email: form.channel === 'email' ? form.email.trim() : '',
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
        <div id="f-what" className={`mode-pick${show('what') ? ' block-error' : ''}`}>
          <button type="button" className={`mode ${knows === 'yes' ? 'on' : ''}`} aria-pressed={knows === 'yes'} onClick={() => setKnows('yes')}>
            <strong>{t('book.knowYes')}</strong>
            <span>{t('book.knowYesHelp')}</span>
          </button>
          <button
            type="button"
            className={`mode ${knows === 'no' ? 'on' : ''}`}
            aria-pressed={knows === 'no'}
            onClick={() => {
              setKnows('no');
              setJobs([]);
            }}
          >
            <strong>{t('book.knowNo')}</strong>
            <span>{t('book.knowNoHelp')}</span>
          </button>
        </div>
        {show('what') && <p className="error-msg" role="alert">{show('what')}</p>}
        {knows === 'no' && <p className="notice">{t('book.fullCheck')}</p>}
        {knows === 'yes' && <p className="muted small">{t('book.pickMany')}</p>}
        {knows === 'yes' && CATS.filter((c) => types.some((w) => w.category === c && w.mode !== 'hourly')).map((c, i) => {
          const list = types.filter((w) => w.category === c && w.mode !== 'hourly');
          const n = list.filter((w) => jobs.includes(w.id)).length;
          return (
            <details key={c} className="jobcat" open={n > 0 ? true : undefined}>
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
        {knows === 'yes' && jobs.length > 0 && <p className="muted small">{t('book.picked', { n: jobs.length })}</p>}
      </section>

      <section className="section">
        <h2 id="book-when" className={show('when') ? 'error-title' : ''}>2. {t('book.when')}</h2>
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
              show('when') && <p className="error-msg" role="alert">{show('when')}</p>
            )}
          </>
        )}
      </section>

      <section className="section">
        <h2>3. {t('book.you')}</h2>
        <Input id="f-name" label={t('book.name')} autoComplete="name" value={form.name} onChange={set('name')} error={show('name')} />
        <div className={`phone-row${show('phone') ? ' field-error' : ''}`}>
          <span className="phone-label">{t('common.phone')}</span>
          <div className="phone-inputs">
            <span className="phone-cc" aria-label={t('book.canada')}>🇨🇦 +1</span>
            <select aria-label={t('book.areaCode')} value={form.area} onChange={set('area')}>
              <optgroup label="Québec">
                {QC_AREA_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Canada">
                {OTHER_CA_AREA_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </optgroup>
            </select>
            <input
              id="f-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-local"
              placeholder="555-0142"
              aria-label={t('book.local7')}
              aria-invalid={show('phone') ? true : undefined}
              value={form.local}
              onChange={(e) => setForm((f) => ({ ...f, local: formatLocal7(e.target.value) }))}
            />
          </div>
          {show('phone') ? <small className="error-msg" role="alert">{show('phone')}</small> : <small className="hint">{t('book.phoneHint')}</small>}
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
        {form.channel === 'email' && (
          <>
            <Input id="f-email" label={t('common.email')} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" value={form.email} onChange={set('email')} error={show('email')} placeholder="nombre@gmail.com" />
            {emailCheck?.kind === 'typo' && (
              <button type="button" className="btn small" onClick={() => setForm((f) => ({ ...f, email: emailCheck.suggestion }))}>
                {t('book.useSuggestion', { s: emailCheck.suggestion })}
              </button>
            )}
          </>
        )}
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
            <Input id="f-address" label={t('book.address')} autoComplete="street-address" value={form.address} onChange={set('address')} hint={location ? t('loc.checkAddress') : t('book.addressHint')} error={show('address')} />
          </>
        ) : (
          <p className="notice">{info.data.shop_address ? t('book.dropoffAt', { a: info.data.shop_address }) : t('book.dropoffLater')}</p>
        )}
      </section>

      <section className="section">
        <h2>4. {t('book.car')}</h2>
        <div id="f-car">
          <VehiclePicker make={form.make} model={form.model} year={form.year} yearOptional errors={{ make: show('make'), model: show('model') }} onChange={(v) => setForm((f) => ({ ...f, ...v }))} />
        </div>
        <TextArea label={`${t('book.message')} (${t('common.optional')})`} value={form.message} onChange={set('message')} placeholder={t('book.messageHint')} />
        {/* Trampa para robots: invisible para personas */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hp" aria-hidden="true" />
      </section>

      <div id="f-consent" className={show('consent') ? 'block-error' : ''}>
        <Check
          label={
            <>
              {t('book.consent')} <Link to="/privacy">{t('book.privacy')}</Link>
            </>
          }
          checked={consent}
          onChange={setConsent}
        />
        {show('consent') && <p className="error-msg">{show('consent')}</p>}
      </div>
      <button
        className="btn primary big"
        disabled={busy}
        onClick={() => {
          setTriedSend(true);
          if (!goToFirstError()) setConfirming(true);
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
              <dd>{jobs.length ? types.filter((w) => jobs.includes(w.id)).map((w) => workName(w, lang)).join(', ') : t('book.knowNoSummary')}</dd>
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
                {form.name} — +1 {form.area} {form.local}
                {form.channel === 'email' && (
                  <>
                    <br />
                    {form.email}
                  </>
                )}
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
      {triedSend && Object.keys(errors).length > 0 && <p className="error small">{t('book.fixRed', { n: Object.keys(errors).length })}</p>}
    </div>
  );
}
