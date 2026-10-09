import { useRef, useState } from 'react';
import { post } from '../../api';
import { SignaturePad, type SignatureHandle } from '../../components/media';
import { Input, Sheet, Status, useAction, useToast } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';
import { Totals } from './WorkTab';

export function QuoteLines({ lines, decisions, setDecision }: { lines: any[]; decisions?: Record<string, string>; setDecision?: (id: string, v: 'approved' | 'rejected') => void }) {
  const { t, f } = useI18n();
  return (
    <ul className="qlines panel">
      {lines.map((l) => {
        const dec = decisions?.[l.id] ?? l.decision;
        return (
          <li key={l.id} className={`qline${setDecision ? ` dec-${dec ?? 'none'}` : ''}`}>
            <div>
              {l.description}
              {l.part_condition && <span className="muted small"> — {t(`order.condition.${l.part_condition}` as Key)}</span>}
              <div className="muted small">
                {l.quantity} × {f.money(l.unit_price_cents)}
              </div>
            </div>
            <div className="right">
              <strong>{f.money(l.total_cents)}</strong>
              {!setDecision && dec !== 'pending' && (
                <div>
                  <Status value={dec === 'approved' ? 'paid' : 'cancelled'} label={t(`order.approval.${dec}` as Key)} />
                </div>
              )}
            </div>
            {setDecision && (
              <div className="decide" role="group" aria-label={l.description}>
                <button type="button" className="dec-yes" aria-pressed={dec === 'approved'} onClick={() => setDecision(l.id, 'approved')}>
                  {dec === 'approved' ? '✓ ' : ''}
                  {t('quote.approve')}
                </button>
                <button type="button" className="dec-no" aria-pressed={dec === 'rejected'} onClick={() => setDecision(l.id, 'rejected')}>
                  {dec === 'rejected' ? '✕ ' : ''}
                  {t('quote.reject')}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function QuoteTab({ d, reload }: { d: any; reload: () => void }) {
  const { t, f } = useI18n();
  const { run, busy } = useAction();
  const toast = useToast();
  const [decide, setDecide] = useState<any>(null);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [signer, setSigner] = useState(d.client.name);
  const sig = useRef<SignatureHandle>(null);
  const canSend = ['diagnosis', 'parts_quote', 'quote_sent'].includes(d.order.status);
  const pending = d.lines.filter((l: any) => l.approval === 'pending');
  const missingOffers = d.parts.filter((p: any) => ['pending', 'quoted'].includes(p.status));
  const qTone: Record<string, string> = { sent: 'quote_sent', approved: 'paid', partial: 'partial', rejected: 'cancelled', superseded: 'closed' };

  return (
    <section className="section">
      {canSend && (
        <div className="panel pad">
          {pending.length === 0 ? (
            <p className="muted">{t('quote.nothingPending')}</p>
          ) : (
            <>
              <Totals totals={d.totals.pending} label={t('order.pendingTotal')} />
              {missingOffers.length > 0 && <p className="notice">{t('quote.needOffers')}</p>}
              <button
                className="btn primary"
                disabled={busy || missingOffers.length > 0}
                onClick={async () => {
                  const r = await run(() => post<{ notified: number }>(`/orders/${d.order.id}/quotes`, {}));
                  if (!r) return;
                  toast(r.notified > 0 ? t('quote.readyToSend') : t('quote.noContact'), r.notified === 0);
                  reload();
                }}
              >
                {d.order.status === 'quote_sent' ? t('quote.resend') : t('quote.send')}
              </button>
            </>
          )}
        </div>
      )}

      {d.quotes.map((q: any) => (
        <article className="stack" key={q.id}>
          <div className="row between">
            <h3>{t('quote.version', { v: q.version })}</h3>
            <Status value={qTone[q.status] ?? q.status} label={t(`quote.status.${q.status}` as Key)} />
          </div>
          <p className="muted small">
            {f.dateTime(q.sent_at)} — {t('quote.validUntil', { d: f.date(q.valid_until + 'T12:00:00') })}
            {q.decided_at && ` — ${f.dateTime(q.decided_at)}`}
          </p>
          <QuoteLines lines={q.lines} />
          <Totals totals={q} />
          <div className="row">
            <a className="btn small" href={`/api/quotes/${q.id}/pdf?lang=${d.client.lang}`} target="_blank" rel="noreferrer">
              {t('common.pdf')}
            </a>
            {q.status === 'sent' && (
              <button
                className="btn small primary"
                onClick={() => {
                  setDecide(q);
                  setDecisions({});
                }}
              >
                {t('quote.recordDecision')}
              </button>
            )}
          </div>
        </article>
      ))}

      <Sheet open={Boolean(decide)} onClose={() => setDecide(null)} title={t('quote.recordDecision')}>
        {decide && (
          <>
            <p className="muted">{t('quote.recordHelp')}</p>
            <div className="row">
              <button className="btn small" onClick={() => setDecisions(Object.fromEntries(decide.lines.map((l: any) => [l.id, 'approved'])))}>
                {t('quote.approveAll')}
              </button>
              <button className="btn small" onClick={() => setDecisions(Object.fromEntries(decide.lines.map((l: any) => [l.id, 'rejected'])))}>
                {t('quote.rejectAll')}
              </button>
            </div>
            <QuoteLines lines={decide.lines} decisions={decisions} setDecision={(id, v) => setDecisions({ ...decisions, [id]: v })} />
            <Input label={t('intake.signerName')} value={signer} onChange={(e) => setSigner(e.target.value)} />
            <SignaturePad ref={sig} />
            <button type="button" className="btn ghost small" onClick={() => sig.current?.clear()}>
              {t('quote.clearSignature')}
            </button>
            <DecisionSummary lines={decide.lines} decisions={decisions} />
            <button
              className="btn primary"
              disabled={busy || decide.lines.some((l: any) => !decisions[l.id])}
              onClick={async () => {
                const signature = sig.current?.toDataUrl() ?? undefined;
                const r = await run(() => post(`/quotes/${decide.id}/decision`, { decisions, signer_name: signer.trim() || d.client.name, signature }), t('quote.decisionSaved'));
                if (r) {
                  setDecide(null);
                  reload();
                }
              }}
            >
              {t('common.save')}
            </button>
          </>
        )}
      </Sheet>
    </section>
  );
}

/** Cuánto suma lo aprobado y qué falta decidir (taller y portal del cliente). */
export function DecisionSummary({ lines, decisions }: { lines: any[]; decisions: Record<string, string> }) {
  const { t, f } = useI18n();
  const missing = lines.filter((l) => !decisions[l.id]).length;
  const approved = lines.filter((l) => decisions[l.id] === 'approved');
  const sum = approved.reduce((s, l) => s + l.total_cents, 0);
  return (
    <div className={`decision-summary${missing ? '' : ' ok'}`} role="status">
      <span>
        {t('quote.approvedSoFar', { n: approved.length, t: lines.length })} — <strong>{f.money(sum)}</strong> {t('quote.plusTaxes')}
      </span>
      {missing > 0 && <span className="error-msg">{t('quote.missingDecisions', { n: missing })}</span>}
    </div>
  );
}
