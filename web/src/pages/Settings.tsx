import { useEffect, useState } from 'react';
import { patch } from '../api';
import { Check, Input, LoadError, Loading, MoneyInput, Select, TextArea, useAction, useLoad, useToast } from '../components/ui';
import { useI18n } from '../i18n';
import { useSession } from '../session';
import { StorageMeter } from '../components/StorageMeter';

export function Settings() {
  const { t } = useI18n();
  const { refresh } = useSession();
  const { data, error, loading, reload } = useLoad('/settings');
  const [s, setS] = useState<any>(null);
  const { run, busy } = useAction();
  useEffect(() => {
    if (data) setS(data);
  }, [data]);
  if (loading && !s) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  if (!s) return null;
  const set = (k: string) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });

  async function save() {
    const body = {
      shop_name: s.shop_name,
      shop_address: s.shop_address,
      shop_phone: s.shop_phone,
      shop_email: s.shop_email,
      taxes_registered: s.taxes_registered,
      gst_number: s.gst_number,
      qst_number: s.qst_number,
      visit_fee_cents: s.visit_fee_cents,
      labor_rate_cents: s.labor_rate_cents,
      parts_margin_bp: Math.round(Number(String(s.margin_pct ?? s.parts_margin_bp / 100).replace(',', '.')) * 100),
      quote_valid_days: Number(s.quote_valid_days),
      default_lang: s.default_lang,
      quiet_start_hour: Number(s.quiet_start_hour),
      quiet_end_hour: Number(s.quiet_end_hour),
      warranty_text: s.warranty_text,
      messaging_mode: s.messaging_mode,
      google_review_url: (s.google_review_url ?? '').trim(),
      booking_enabled: s.booking_enabled,
      track_staff_location: s.track_staff_location,
      booking_days: s.booking_days,
      booking_start_hour: Number(s.booking_start_hour),
      booking_end_hour: Number(s.booking_end_hour),
      booking_slot_minutes: Number(s.booking_slot_minutes),
      booking_min_notice_hours: Number(s.booking_min_notice_hours),
      booking_max_days: Number(s.booking_max_days),
    };
    if (await run(() => patch('/settings', body), t('common.saved'))) {
      void refresh();
      void reload();
    }
  }

  return (
    <>
      <h1>{t('more.settings')}</h1>
      <StorageMeter />
      <section className="section">
        <h2>{t('settings.shop')}</h2>
        <Input label={t('auth.shopName')} value={s.shop_name} onChange={set('shop_name')} />
        <Input label={t('common.address')} value={s.shop_address} onChange={set('shop_address')} />
        <div className="grid2">
          <Input label={t('common.phone')} value={s.shop_phone} onChange={set('shop_phone')} />
          <Input label={t('common.email')} value={s.shop_email} onChange={set('shop_email')} />
        </div>
      </section>
      <section className="section">
        <h2>{t('settings.prices')}</h2>
        <div className="grid2">
          <MoneyInput label={t('settings.visitFee')} cents={s.visit_fee_cents} onChange={(v) => setS({ ...s, visit_fee_cents: v ?? 0 })} />
          <MoneyInput label={t('settings.laborRate')} cents={s.labor_rate_cents} onChange={(v) => setS({ ...s, labor_rate_cents: v ?? 0 })} />
          <Input label={t('settings.margin')} inputMode="decimal" value={s.margin_pct ?? s.parts_margin_bp / 100} onChange={(e) => setS({ ...s, margin_pct: e.target.value })} />
          <Input label={t('settings.quoteDays')} type="number" min={1} value={s.quote_valid_days} onChange={set('quote_valid_days')} />
        </div>
      </section>
      <section className="section">
        <h2>{t('settings.taxes')}</h2>
        <Check label={t('settings.taxesRegistered')} checked={s.taxes_registered} onChange={(v) => setS({ ...s, taxes_registered: v })} />
        <p className="muted small">{t('settings.taxesHelp')}</p>
        {s.taxes_registered && (
          <div className="grid2">
            <Input label={t('settings.gstNumber')} value={s.gst_number} onChange={set('gst_number')} />
            <Input label={t('settings.qstNumber')} value={s.qst_number} onChange={set('qst_number')} />
          </div>
        )}
      </section>
      <section className="section">
        <h2>{t('settings.mode')}</h2>
        <div className="list">
          {(['manual', 'auto'] as const).map((m) => (
            <label key={m} className="check item">
              <input type="radio" name="mode" checked={s.messaging_mode === m} onChange={() => setS({ ...s, messaging_mode: m })} />
              <span>
                <strong>{t(m === 'manual' ? 'settings.mode.manual' : 'settings.mode.auto')}</strong>
                <br />
                <span className="muted small">{t(m === 'manual' ? 'settings.mode.manualHelp' : 'settings.mode.autoHelp')}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <BookingSettings s={s} setS={setS} />
      <section className="section">
        <h2>{t('geo.title')}</h2>
        <Check label={t('geo.enable')} checked={Boolean(s.track_staff_location)} onChange={(track_staff_location) => setS({ ...s, track_staff_location })} />
        <p className="muted small">{t('geo.settingsHelp')}</p>
      </section>
      <section className="section">
        <h2>{t('settings.reviews')}</h2>
        <p className="muted small">{t('settings.reviewsHelp')}</p>
        <Input label={t('settings.reviewUrl')} type="url" inputMode="url" placeholder="https://g.page/r/…" value={s.google_review_url ?? ''} onChange={set('google_review_url')} />
        <p className="muted small">{t('settings.reviewHow')}</p>
      </section>
      <section className="section">
        <h2>{t('settings.messages')}</h2>
        <div className="grid3">
          <Input label={t('settings.quietStart')} type="number" min={0} max={23} value={s.quiet_start_hour} onChange={set('quiet_start_hour')} />
          <Input label={t('settings.quietEnd')} type="number" min={0} max={23} value={s.quiet_end_hour} onChange={set('quiet_end_hour')} />
          <Select label={t('settings.defaultLang')} value={s.default_lang} onChange={set('default_lang')}>
            <option value="fr">{t('lang.fr')}</option>
            <option value="en">{t('lang.en')}</option>
            <option value="es">{t('lang.es')}</option>
          </Select>
        </div>
        {(['fr', 'en', 'es'] as const).map((l) => (
          <TextArea
            key={l}
            label={`${t('settings.warranty')} — ${t(`lang.${l}`)}`}
            rows={2}
            value={s.warranty_text[l] ?? ''}
            onChange={(e) => setS({ ...s, warranty_text: { ...s.warranty_text, [l]: e.target.value } })}
          />
        ))}
      </section>
      <button className="btn primary" disabled={busy} onClick={save}>
        {t('common.save')}
      </button>
    </>
  );
}

/** Reservas en línea: horario, duración y enlace para Facebook/Messenger. */
function BookingSettings({ s, setS }: { s: any; setS: (v: any) => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const link = `${window.location.origin}/reservar`;
  const reply = t('bookset.replyText', { shop: s.shop_name, link });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('bookset.copied'));
    } catch {
      /* el usuario puede copiarlo a mano */
    }
  };
  const days = [1, 2, 3, 4, 5, 6, 7];
  const dayName = (d: number) => new Intl.DateTimeFormat(lang === 'en' ? 'en-CA' : lang === 'fr' ? 'fr-CA' : 'es', { weekday: 'short' }).format(new Date(Date.UTC(2024, 0, d)));
  const num = (k: string) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value });
  return (
    <section className="section">
      <h2>{t('bookset.title')}</h2>
      <Check label={t('bookset.enabled')} checked={Boolean(s.booking_enabled)} onChange={(booking_enabled) => setS({ ...s, booking_enabled })} />
      <div className="panel pad stack">
        <strong>{t('bookset.link')}</strong>
        <code className="linkbox">{link}</code>
        <div className="row">
          <button className="btn small primary" type="button" onClick={() => copy(link)}>
            {t('bookset.copyLink')}
          </button>
          <a className="btn small" href="/reservar" target="_blank" rel="noreferrer">
            {t('bookset.open')}
          </a>
        </div>
        <p className="muted small">{t('bookset.where')}</p>
        <TextArea label={t('bookset.reply')} readOnly rows={3} value={reply} />
        <button className="btn small" type="button" onClick={() => copy(reply)}>
          {t('bookset.copyReply')}
        </button>
        <p className="muted small">{t('bookset.howReply')}</p>
      </div>
      <div className="stack">
        <span className="muted small">{t('bookset.days')}</span>
        <div className="chips times">
          {days.map((d) => {
            const on = (s.booking_days ?? []).includes(d);
            return (
              <button
                key={d}
                type="button"
                className={`chip ${on ? 'on' : ''}`}
                aria-pressed={on}
                onClick={() => setS({ ...s, booking_days: on ? s.booking_days.filter((x: number) => x !== d) : [...(s.booking_days ?? []), d].sort() })}
              >
                {dayName(d)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid2">
        <Input label={t('bookset.from')} type="number" min={0} max={23} value={s.booking_start_hour ?? 8} onChange={num('booking_start_hour')} />
        <Input label={t('bookset.to')} type="number" min={1} max={24} value={s.booking_end_hour ?? 18} onChange={num('booking_end_hour')} />
      </div>
      <div className="grid3">
        <Input label={t('bookset.slot')} type="number" min={15} max={480} step={15} value={s.booking_slot_minutes ?? 90} onChange={num('booking_slot_minutes')} />
        <Input label={t('bookset.notice')} type="number" min={0} max={336} value={s.booking_min_notice_hours ?? 12} onChange={num('booking_min_notice_hours')} />
        <Input label={t('bookset.maxDays')} type="number" min={1} max={120} value={s.booking_max_days ?? 21} onChange={num('booking_max_days')} />
      </div>
      <p className="muted small">{t('bookset.help')}</p>
    </section>
  );
}
