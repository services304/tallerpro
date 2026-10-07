import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { patch, post } from '../../api';
import { LangSwitch } from '../../App';
import { ChannelPicker } from '../../components/forms';
import { SignaturePad, type SignatureHandle } from '../../components/media';
import { Check, Input, Loading, OrderStatus, Status, Tag, useAction, useLoad, vehicleName } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';
import { PhotoGrid } from '../order/PhotosTab';
import { QuoteLines } from '../order/QuoteTab';
import { Totals } from '../order/WorkTab';

function QuoteDecision({ token, quote, clientName, onDone }: { token: string; quote: any; clientName: string; onDone: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [name, setName] = useState(clientName);
  const [signed, setSigned] = useState(false);
  const sig = useRef<SignatureHandle>(null);
  const all = quote.lines.every((l: any) => decisions[l.id]);
  const approvedTotal = quote.lines.filter((l: any) => decisions[l.id] === 'approved').reduce((s: number, l: any) => s + l.total_cents, 0);
  const { f } = useI18n();
  return (
    <div className="stack">
      <p>{t('portal.quoteHelp')}</p>
      <div className="row">
        <button className="btn small" onClick={() => setDecisions(Object.fromEntries(quote.lines.map((l: any) => [l.id, 'approved'])))}>
          {t('quote.approveAll')}
        </button>
        <button className="btn small" onClick={() => setDecisions(Object.fromEntries(quote.lines.map((l: any) => [l.id, 'rejected'])))}>
          {t('quote.rejectAll')}
        </button>
      </div>
      <QuoteLines lines={quote.lines} decisions={decisions} setDecision={(id, v) => setDecisions({ ...decisions, [id]: v })} />
      <Totals totals={quote} />
      {all && (
        <p>
          {t('order.approvedTotal')}: <strong>{f.money(approvedTotal)}</strong> + {t('common.gst')}/{t('common.qst')}
        </p>
      )}
      <h3>{t('portal.sign')}</h3>
      <Input label={t('portal.signName')} value={name} onChange={(e) => setName(e.target.value)} />
      <SignaturePad ref={sig} onChange={(e) => setSigned(!e)} />
      <button
        className="btn primary"
        disabled={busy || !all || !signed || !name.trim()}
        onClick={async () => {
          const r = await run(() => post(`/portal/${token}/quotes/${quote.id}/decision`, { decisions, signer_name: name, signature: sig.current?.toDataUrl() }), t('portal.thanks'));
          if (r) onDone();
        }}
      >
        {t('portal.confirm')}
      </button>
    </div>
  );
}

function Messages({ token, order, onSent }: { token: string; order: any; onSent: () => void }) {
  const { t, f } = useI18n();
  const { run, busy } = useAction();
  const [body, setBody] = useState('');
  return (
    <div className="stack">
      <h3>{t('portal.messages')}</h3>
      {order.messages.map((m: any) => (
        <div key={m.id} className={`bubble ${m.direction === 'in' ? 'out' : 'in'}`}>
          <p>{m.body}</p>
          <span className="muted small">{f.dateTime(m.created_at)}</span>
        </div>
      ))}
      <textarea aria-label={t('portal.messages')} placeholder={t('portal.messagePlaceholder')} value={body} onChange={(e) => setBody(e.target.value)} />
      <button
        className="btn"
        disabled={busy || !body.trim()}
        onClick={async () => {
          if (await run(() => post(`/portal/${token}/messages`, { order_id: order.id, body }))) {
            setBody('');
            onSent();
          }
        }}
      >
        {t('portal.send')}
      </button>
    </div>
  );
}

function Preferences({ token, client, onSaved }: { token: string; client: any; onSaved: () => void }) {
  const { t, setLang } = useI18n();
  const { run, busy } = useAction();
  const [p, setP] = useState({
    lang: client.lang,
    channels: client.channels as string[],
    consent_maintenance: Boolean(client.consent_maintenance),
    consent_promo: Boolean(client.consent_promo),
  });
  return (
    <section className="section">
      <h2>{t('portal.preferences')}</h2>
      <div className="panel pad">
        <div className="seg" role="group" aria-label={t('common.language')}>
          {(['fr', 'en', 'es'] as const).map((l) => (
            <button key={l} aria-pressed={p.lang === l} onClick={() => setP({ ...p, lang: l })}>
              {t(`lang.${l}`)}
            </button>
          ))}
        </div>
        <ChannelPicker value={p.channels} hasEmail={Boolean(client.email)} onChange={(channels) => setP({ ...p, channels })} />
        <Check label={t('clients.consent.maintenance')} checked={p.consent_maintenance} onChange={(v) => setP({ ...p, consent_maintenance: v })} />
        <Check label={t('clients.consent.promo')} checked={p.consent_promo} onChange={(v) => setP({ ...p, consent_promo: v })} />
        <button
          className="btn primary"
          disabled={busy || p.channels.length === 0}
          onClick={async () => {
            if (await run(() => patch(`/portal/${token}/preferences`, p), t('common.saved'))) {
              setLang(p.lang);
              onSaved();
            }
          }}
        >
          {t('common.save')}
        </button>
        <div className="row">
          <a className="btn small" href={`/api/portal/${token}/export`} download>
            {t('portal.myData')}
          </a>
          <Link to="/privacy" className="small">
            {t('more.privacy')}
          </Link>
        </div>
        <p className="muted small">{t('portal.deleteData')}</p>
      </div>
    </section>
  );
}

export function Portal() {
  const { token = '' } = useParams();
  const { t, f, setLang } = useI18n();
  const { data, error, loading, reload } = useLoad(`/portal/${token}`);
  const langSet = useRef(false);

  useEffect(() => {
    if (!data || langSet.current) return;
    langSet.current = true;
    let stored = null;
    try {
      stored = localStorage.getItem('tallerpro.lang');
    } catch {
      /* nada */
    }
    if (!stored) setLang(data.client.lang);
  }, [data, setLang]);

  if (loading && !data) return <div className="main"><Loading /></div>;
  if (error)
    return (
      <div className="main">
        <p className="error">{error.status === 401 ? t('portal.linkExpired') : error.message}</p>
        <Link className="btn primary" to="/portal">
          {t('portal.loginTitle')}
        </Link>
      </div>
    );
  const d = data!;

  return (
    <div className="shell" style={{ gridTemplateRows: 'auto 1fr' }}>
      <header className="topbar">
        <span className="shop">{d.shop.shop_name}</span>
        <LangSwitch />
      </header>
      <main className="main" style={{ paddingBottom: 48 }}>
        <h1>{t('portal.hello', { name: d.client.name.split(' ')[0] })}</h1>

        {d.visits.length > 0 && (
          <section className="panel pad">
            <h2>{t('portal.upcoming')}</h2>
            {d.visits.map((v: any) => (
              <p key={v.id}>
                <strong>
                  {f.dayLong(v.scheduled_start)}, {f.time(v.scheduled_start)}
                </strong>
                <br />
                <span className="muted">{v.address}</span>
              </p>
            ))}
          </section>
        )}

        {d.orders.map((o: any) => {
          const openQuote = o.quotes.find((q: any) => q.status === 'sent');
          const lastQuote = o.quotes[0];
          return (
            <section className="section" key={o.id}>
              <div className="row between">
                <Tag big>{o.number}</Tag>
                <OrderStatus status={o.status} />
              </div>
              <p className="muted">{[vehicleName(o), o.plate].filter(Boolean).join(' — ')}</p>
              {o.reason && <p>{o.reason}</p>}

              {openQuote && (
                <div className="panel pad">
                  <h2>{t('portal.quote')}</h2>
                  <p className="muted small">{t('quote.validUntil', { d: f.date(openQuote.valid_until + 'T12:00:00') })}</p>
                  <QuoteDecision token={token} quote={openQuote} clientName={d.client.name} onDone={reload} />
                </div>
              )}
              {!openQuote && lastQuote && (
                <details className="panel pad">
                  <summary>
                    {t('portal.quote')} — <Status value={lastQuote.status === 'rejected' ? 'cancelled' : 'paid'} label={t(`quote.status.${lastQuote.status}` as Key)} />
                  </summary>
                  <QuoteLines lines={lastQuote.lines} />
                  <a className="btn small" href={`/api/portal/${token}/quotes/${lastQuote.id}/pdf`} target="_blank" rel="noreferrer">
                    {t('common.pdf')}
                  </a>
                </details>
              )}

              <div className="stack">
                <h3>{t('portal.timeline')}</h3>
                <ol className="timeline">
                  {o.history.map((h: any, i: number) => (
                    <li key={i} className={i === o.history.length - 1 ? 'now' : ''}>
                      <strong>{t(`status.${h.to_status}` as Key)}</strong> <span className="muted small">{f.dateTime(h.created_at)}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {o.photos.length > 0 && (
                <div className="stack">
                  <h3>{t('portal.photos')}</h3>
                  <PhotoGrid photos={o.photos} srcFor={(p) => `/api/portal/${token}/photos/${p.id}`} />
                </div>
              )}

              {!['closed', 'cancelled'].includes(o.status) && <Messages token={token} order={o} onSent={reload} />}
            </section>
          );
        })}

        {d.invoices.length > 0 && (
          <section className="section">
            <h2>{t('portal.invoices')}</h2>
            <ul className="list">
              {d.invoices.map((i: any) => (
                <li key={i.id}>
                  <a className="item" href={`/api/portal/${token}/invoices/${i.id}/pdf`} target="_blank" rel="noreferrer">
                    <div className="item-top">
                      <span>{t('invoice.number', { n: i.number })}</span>
                      <Status value={i.status} label={t(`invoice.status.${i.status}` as Key)} />
                    </div>
                    <span className="muted small">
                      {f.date(i.issued_at)} — {f.money(i.total_cents)}
                      {i.status !== 'paid' && ` — ${t('invoice.balance')} ${f.money(i.total_cents - i.paid_cents)}`}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
            {d.invoices.some((i: any) => i.status !== 'paid') && <p className="muted small">{t('portal.payOnSite')}</p>}
          </section>
        )}

        <Preferences token={token} client={d.client} onSaved={reload} />
      </main>
    </div>
  );
}
