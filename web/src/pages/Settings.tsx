import { useEffect, useState } from 'react';
import { patch } from '../api';
import { Check, Input, LoadError, Loading, MoneyInput, Select, TextArea, useAction, useLoad } from '../components/ui';
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
