import { useState } from 'react';
import { del, patch, post } from '../../api';
import { Input, MoneyInput, Select, Sheet, useAction } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';

type Kind = 'labor' | 'part' | 'fee' | 'discount';

/** Modificar la factura a mano: cambiar, quitar o agregar líneas. Los totales se recalculan solos. */
export function InvoiceEditor({ invoice, lines, onDone }: { invoice: any; lines: any[]; onDone: () => void }) {
  const { t, f } = useI18n();
  const { run, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<null | { id: string; description: string; quantity: string; price: number | null }>(null);
  const [adding, setAdding] = useState<null | { kind: Kind; description: string; quantity: string; price: number | null }>(null);
  const [sureDel, setSureDel] = useState<string | null>(null);
  const approved = lines.filter((l) => l.approval === 'approved');

  async function done() {
    setEdit(null);
    setAdding(null);
    setSureDel(null);
    onDone();
  }
  const qty = (v: string) => Number(v.replace(',', '.')) || 0;

  return (
    <>
      <button className="btn small" onClick={() => setOpen(true)}>
        {t('invedit.button')}
      </button>
      <Sheet open={open} onClose={() => (setOpen(false), setEdit(null), setAdding(null))} title={t('invedit.title', { n: invoice.number })}>
        <p className="muted small">{t('invedit.help')}</p>
        <ul className="list">
          {approved.map((l) => (
            <li key={l.id} className="item">
              {edit && edit.id === l.id ? (
                <div className="stack">
                  <Input label={t('common.description')} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                  <div className="grid2">
                    <Input label={t('common.quantity')} inputMode="decimal" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />
                    <MoneyInput label={t('common.price')} cents={edit.price} onChange={(price) => setEdit({ ...edit, price })} />
                  </div>
                  <div className="row">
                    <button
                      className="btn primary small"
                      disabled={busy || !edit.description.trim() || qty(edit.quantity) <= 0 || edit.price === null}
                      onClick={async () => {
                        const r = await run(
                          () => patch(`/invoices/${invoice.id}/lines/${l.id}`, { description: edit.description, quantity: qty(edit.quantity), unit_price_cents: edit.price }),
                          t('invedit.saved'),
                        );
                        if (r) await done();
                      }}
                    >
                      {t('common.save')}
                    </button>
                    <button className="btn ghost small" onClick={() => setEdit(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="item-top">
                    <span>
                      {l.description}
                      <span className="muted small"> — {t(`invedit.kind.${l.kind}` as Key)}</span>
                    </span>
                    <strong>
                      {l.kind === 'discount' ? '−' : ''}
                      {f.money(Math.round(l.quantity * l.unit_price_cents))}
                    </strong>
                  </div>
                  <div className="row">
                    <span className="muted small">
                      {l.quantity} × {f.money(l.unit_price_cents)}
                    </span>
                    <button className="btn small" onClick={() => setEdit({ id: l.id, description: l.description, quantity: String(l.quantity), price: l.unit_price_cents })}>
                      {t('common.edit')}
                    </button>
                    <button
                      className={sureDel === l.id ? 'btn small danger' : 'btn ghost small'}
                      disabled={busy || approved.length <= 1}
                      onClick={async () => {
                        if (sureDel !== l.id) return setSureDel(l.id);
                        const r = await run(() => del(`/invoices/${invoice.id}/lines/${l.id}`), t('invedit.saved'));
                        if (r) await done();
                      }}
                    >
                      {sureDel === l.id ? t('invedit.sureDelete') : t('invedit.delete')}
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="panel pad stack">
            <strong>{t('invedit.add')}</strong>
            <Select label={t('invedit.type')} value={adding.kind} onChange={(e) => setAdding({ ...adding, kind: e.target.value as Kind })}>
              {(['labor', 'part', 'fee', 'discount'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`invedit.kind.${k}` as Key)}
                </option>
              ))}
            </Select>
            <Input label={t('common.description')} value={adding.description} onChange={(e) => setAdding({ ...adding, description: e.target.value })} placeholder={adding.kind === 'discount' ? t('invedit.discountHint') : ''} />
            <div className="grid2">
              <Input label={t('common.quantity')} inputMode="decimal" value={adding.quantity} onChange={(e) => setAdding({ ...adding, quantity: e.target.value })} />
              <MoneyInput label={adding.kind === 'discount' ? t('invedit.discountAmount') : t('common.price')} cents={adding.price} onChange={(price) => setAdding({ ...adding, price })} />
            </div>
            <div className="row">
              <button
                className="btn primary small"
                disabled={busy || !adding.description.trim() || qty(adding.quantity) <= 0 || adding.price === null}
                onClick={async () => {
                  const r = await run(
                    () => post(`/invoices/${invoice.id}/lines`, { kind: adding.kind, description: adding.description, quantity: qty(adding.quantity), unit_price_cents: adding.price }),
                    t('invedit.saved'),
                  );
                  if (r) await done();
                }}
              >
                {t('common.add')}
              </button>
              <button className="btn ghost small" onClick={() => setAdding(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn" onClick={() => setAdding({ kind: 'labor', description: '', quantity: '1', price: null })}>
            + {t('invedit.add')}
          </button>
        )}
        <p className="muted small">{t('invedit.note')}</p>
      </Sheet>
    </>
  );
}
