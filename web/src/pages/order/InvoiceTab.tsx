import { useState } from 'react';
import { post } from '../../api';
import { Input, MoneyInput, Select, Sheet, Status, useAction } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';
import { useSession } from '../../session';
import { Totals } from './WorkTab';

const METHODS = ['interac', 'cash', 'card', 'debit', 'cheque'] as const;

export function InvoiceTab({ d, reload }: { d: any; reload: () => void }) {
  const { t, f } = useI18n();
  const { user } = useSession();
  const { run, busy } = useAction();
  const [pay, setPay] = useState<any>(null);
  const [form, setForm] = useState({ method: 'interac', amount: null as number | null, reference: '' });
  const [voiding, setVoiding] = useState<any>(null);
  const [reason, setReason] = useState('');
  const active = d.invoices.filter((i: any) => i.status !== 'void');
  const canCreate = active.length === 0 && d.totals.approved.subtotal_cents > 0 && !['received', 'cancelled'].includes(d.order.status);

  return (
    <section className="section">
      {active.length === 0 && (
        <div className="panel pad">
          <p className="muted">{t('invoice.none')}</p>
          <Totals totals={d.totals.approved} label={t('order.approvedTotal')} />
          {canCreate && d.totals.pending.subtotal_cents > 0 && <p className="notice small">{t('invoice.pendingWarning', { p: f.money(d.totals.pending.total_cents) })}</p>}
          {canCreate && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                const r = await run(() => post(`/orders/${d.order.id}/invoice`));
                if (r) {
                  reload();
                }
              }}
            >
              {t('invoice.create')}
            </button>
          )}
        </div>
      )}

      {d.invoices.map((inv: any) => {
        const balance = inv.total_cents - inv.paid_cents;
        const payments = d.payments.filter((p: any) => p.invoice_id === inv.id);
        return (
          <article className="panel pad" key={inv.id}>
            <div className="item-top">
              <h3>{t('invoice.number', { n: inv.number })}</h3>
              <Status value={inv.status} label={t(`invoice.status.${inv.status}` as Key)} />
            </div>
            <p className="muted small">
              {t(`invoice.kind.${inv.kind}` as Key)} — {f.date(inv.issued_at)}
            </p>
            <Totals totals={inv} />
            {inv.status !== 'void' && inv === active[0] && inv.subtotal_cents !== d.totals.approved.subtotal_cents && d.totals.approved.subtotal_cents > 0 && (
              <div className="notice stack">
                <span>{t('invoice.outdated', { p: f.money(d.totals.approved.total_cents) })}</span>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={async () => {
                    const r = await run(() => post(`/orders/${d.order.id}/invoice/sync`), t('invoice.updated'));
                    if (r) reload();
                  }}
                >
                  {t('invoice.update')}
                </button>
              </div>
            )}
            {payments.length > 0 && (
              <ul className="list">
                {payments.map((p: any) => (
                  <li key={p.id} className="item">
                    <div className="item-top">
                      <span>
                        {t(`invoice.method.${p.method}` as Key)}
                        {p.reference && <span className="muted"> — {p.reference}</span>}
                      </span>
                      <strong>{f.money(p.amount_cents)}</strong>
                    </div>
                    <span className="muted small">{f.dateTime(p.paid_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {inv.status !== 'void' && balance > 0 && (
              <p>
                {t('invoice.balance')}: <strong>{f.money(balance)}</strong>
              </p>
            )}
            <div className="row">
              {inv.status !== 'void' && balance > 0 && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setPay(inv);
                    setForm({ method: 'interac', amount: balance, reference: '' });
                  }}
                >
                  {t('invoice.addPayment')}
                </button>
              )}
              <a className="btn small" href={`/api/invoices/${inv.id}/pdf?lang=fr`} target="_blank" rel="noreferrer">
                PDF FR
              </a>
              {d.client.lang !== 'fr' && (
                <a className="btn small" href={`/api/invoices/${inv.id}/pdf?lang=${d.client.lang}`} target="_blank" rel="noreferrer">
                  PDF {d.client.lang.toUpperCase()}
                </a>
              )}
              {user?.role === 'admin' && inv.status !== 'void' && (
                <button className="btn small danger" onClick={() => (setVoiding(inv), setReason(''))}>
                  {t('invoice.void')}
                </button>
              )}
            </div>
          </article>
        );
      })}

      <Sheet open={Boolean(pay)} onClose={() => setPay(null)} title={t('invoice.addPayment')}>
        <Select label={t('invoice.method')} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`invoice.method.${m}` as Key)}
            </option>
          ))}
        </Select>
        <MoneyInput label={t('invoice.amount')} cents={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        <Input label={`${t('invoice.reference')} (${t('common.optional')})`} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        <button
          className="btn primary"
          disabled={busy || !form.amount}
          onClick={async () => {
            const r = await run(() => post(`/invoices/${pay.id}/payments`, { method: form.method, amount_cents: form.amount, reference: form.reference }), t('invoice.paymentSaved'));
            if (r) {
              setPay(null);
              reload();
            }
          }}
        >
          {t('invoice.addPayment')}
        </button>
      </Sheet>

      <Sheet open={Boolean(voiding)} onClose={() => setVoiding(null)} title={t('invoice.void')}>
        <Input label={t('invoice.voidReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button
          className="btn danger"
          disabled={busy || reason.trim().length < 3}
          onClick={async () => {
            const r = await run(() => post(`/invoices/${voiding.id}/void`, { reason }));
            if (r) {
              setVoiding(null);
              reload();
            }
          }}
        >
          {t('invoice.void')}
        </button>
      </Sheet>
    </section>
  );
}
