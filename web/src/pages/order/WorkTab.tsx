import { useEffect, useState } from 'react';
import { del, patch, post } from '../../api';
import { DictateButton } from '../../components/media';
import { Input, MoneyInput, Select, Seg, Sheet, Status, TextArea, useAction, useLoad, useToast } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';

const EDITABLE = ['received', 'diagnosis', 'parts_quote', 'in_repair', 'waiting_parts', 'approved'];

export function Totals({ totals, label }: { totals: any; label?: string }) {
  const { t, f } = useI18n();
  return (
    <dl className="totals">
      {label && (
        <>
          <dt className="muted">{label}</dt>
          <dd />
        </>
      )}
      <dt>{t('common.subtotal')}</dt>
      <dd className="right">{f.money(totals.subtotal_cents)}</dd>
      {(totals.gst_cents > 0 || totals.qst_cents > 0) && (
        <>
          <dt>{t('common.gst')}</dt>
          <dd className="right">{f.money(totals.gst_cents)}</dd>
          <dt>{t('common.qst')}</dt>
          <dd className="right">{f.money(totals.qst_cents)}</dd>
        </>
      )}
      <dt className="grand">{t('common.total')}</dt>
      <dd className="grand right">{f.money(totals.total_cents)}</dd>
    </dl>
  );
}

function Notes({ d, reload }: { d: any; reload: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [reason, setReason] = useState(d.order.reason);
  const [diagnosis, setDiagnosis] = useState(d.order.diagnosis);
  const dirty = reason !== d.order.reason || diagnosis !== d.order.diagnosis;
  useEffect(() => {
    setReason(d.order.reason);
    setDiagnosis(d.order.diagnosis);
  }, [d.order.reason, d.order.diagnosis]);
  return (
    <section className="section">
      <TextArea label={t('order.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <TextArea label={t('order.diagnosis')} rows={5} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
      <div className="row">
        <DictateButton onText={(txt) => setDiagnosis((x: string) => (x ? `${x} ${txt}` : txt))} />
        {dirty && (
          <button className="btn primary small" disabled={busy} onClick={async () => (await run(() => patch(`/orders/${d.order.id}`, { reason, diagnosis }), t('common.saved'))) && reload()}>
            {t('common.save')}
          </button>
        )}
      </div>
    </section>
  );
}

/** Nombre de un tipo de trabajo en un idioma (con respaldo a los otros). */
export function workName(w: any, lang: string) {
  const n = w?.names ?? {};
  return n[lang] || n.fr || n.es || n.en || w?.name || '';
}

export const WORK_CATEGORIES = ['maintenance', 'tires', 'brakes', 'electrical', 'engine', 'suspension', 'exhaust', 'climate', 'other'] as const;

type LineKind = 'labor' | 'part' | 'fee' | 'discount';

function AddLine({ d, kind, onDone }: { d: any; kind: LineKind; onDone: () => void }) {
  const { t, f, lang } = useI18n();
  const types = useLoad<any[]>('/work-types');
  const { run, busy } = useAction();
  const [workType, setWorkType] = useState('');
  const [description, setDescription] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState<number | null>(kind === 'labor' ? d.settings.labor_rate_cents : null);
  const [cost, setCost] = useState<number | null>(null);
  const [condition, setCondition] = useState<'new' | 'used' | 'rebuilt'>('new');
  const wt = types.data?.find((x) => x.id === workType);
  const active = types.data?.filter((x) => x.active) ?? [];
  const margin = d.settings.parts_margin_bp / 10000;

  return (
    <div className="stack">
      {kind === 'labor' && (
        <Select
          label={t('order.workType')}
          value={workType}
          onChange={(e) => {
            const w = types.data?.find((x) => x.id === e.target.value);
            setWorkType(e.target.value);
            if (w) {
              // La línea se escribe en el idioma del cliente (sale así en la cotización y la factura).
              setDescription(workName(w, d.client.lang));
              setPrice(w.price_cents);
              setQty(w.mode === 'hourly' && w.est_minutes ? String(Math.round((w.est_minutes / 60) * 4) / 4) : '1');
            }
          }}
        >
          <option value="">{t('order.customPrice')}</option>
          {WORK_CATEGORIES.filter((c) => active.some((x) => x.category === c)).map((c) => (
            <optgroup key={c} label={t(`workTypes.cat.${c}` as Key)}>
              {active
                .filter((x) => x.category === c)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {workName(x, lang)} — {f.money(x.price_cents)}
                    {x.mode === 'hourly' ? ' /h' : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      )}
      <Input label={t('common.description')} required value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid2">
        <Input label={kind === 'labor' && (!wt || wt.mode === 'hourly') ? t('order.hours') : t('common.quantity')} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <MoneyInput label={kind === 'part' ? t('order.clientPrice') : t('common.price')} cents={price} onChange={setPrice} />
      </div>
      {kind === 'part' && (
        <>
          <MoneyInput
            label={`${t('order.unitCost')} (${t('common.optional')})`}
            cents={cost}
            onChange={setCost}
            hint={cost ? t('order.suggestedPrice', { p: f.money(Math.round(cost * (1 + margin))) }) : t('order.costHelp')}
          />
          {cost !== null && cost > 0 && price === null && (
            <button type="button" className="btn small" onClick={() => setPrice(Math.round(cost * (1 + margin)))}>
              {t('order.useSuggested')}
            </button>
          )}
          <Seg
            label={t('order.condition')}
            value={condition}
            onChange={setCondition}
            options={(['new', 'used', 'rebuilt'] as const).map((c) => ({ value: c, label: t(`order.condition.${c}` as Key) }))}
          />
        </>
      )}
      <button
        className="btn primary"
        disabled={busy || !description || price === null}
        onClick={async () => {
          const r = await run(() =>
            post(`/orders/${d.order.id}/lines`, {
              kind,
              description,
              work_type_id: workType || null,
              quantity: Number(qty.replace(',', '.')) || 1,
              unit_price_cents: price,
              ...(kind === 'part' ? { unit_cost_cents: cost ?? 0, part_condition: condition } : {}),
            }),
          );
          if (r) onDone();
        }}
      >
        {t('common.add')}
      </button>
    </div>
  );
}

/** Corregir cantidad y precio de una línea que el cliente todavía no aprobó. */
function EditLine({ d, line, onDone }: { d: any; line: any; onDone: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [description, setDescription] = useState(line.description);
  const [qty, setQty] = useState(String(line.quantity));
  const [price, setPrice] = useState<number | null>(line.unit_price_cents);
  return (
    <div className="stack">
      <Input label={t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid2">
        <Input label={t('common.quantity')} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <MoneyInput label={line.kind === 'part' ? t('order.clientPrice') : t('common.price')} cents={price} onChange={setPrice} />
      </div>
      <button
        className="btn primary"
        disabled={busy || !description || price === null}
        onClick={async () => {
          const r = await run(
            () => patch(`/orders/${d.order.id}/lines/${line.id}`, { description, quantity: Number(qty.replace(',', '.')) || 1, unit_price_cents: price }),
            t('common.saved'),
          );
          if (r) onDone();
        }}
      >
        {t('common.save')}
      </button>
    </div>
  );
}

function Lines({ d, reload }: { d: any; reload: () => void }) {
  const { t, f } = useI18n();
  const { run } = useAction();
  const [adding, setAdding] = useState<null | LineKind>(null);
  const [editing, setEditing] = useState<any>(null);
  const editable = EDITABLE.includes(d.order.status);
  const tone = { pending: 's-wait', approved: 's-ok', rejected: 's-bad' } as Record<string, string>;
  return (
    <section className="section">
      <div className="row between">
        <h2>{t('order.lines')}</h2>
        {editable && (
          <div className="row">
            <button className="btn small" onClick={() => setAdding('labor')}>+ {t('order.addLabor')}</button>
            <button className="btn small" onClick={() => setAdding('part')}>+ {t('order.addManualPart')}</button>
            <button className="btn small" onClick={() => setAdding('fee')}>+ {t('order.addFee')}</button>
            <button className="btn small" onClick={() => setAdding('discount')}>+ {t('order.addDiscount')}</button>
          </div>
        )}
      </div>
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="lines">
          <thead>
            <tr>
              <th>{t('common.description')}</th>
              <th className="num">{t('common.quantity')}</th>
              <th className="num">{t('common.total')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l: any) => (
              <tr key={l.id}>
                <td>
                  {l.description}
                  {l.part_condition && <span className="muted small"> — {t(`order.condition.${l.part_condition}` as Key)}</span>}
                  <div>
                    <span className={`status ${tone[l.approval]}`}>{t(`order.approval.${l.approval}` as Key)}</span>
                  </div>
                </td>
                <td className="num">{l.quantity}</td>
                <td className="num">{f.money(Math.round(l.quantity * l.unit_price_cents) * (l.kind === 'discount' ? -1 : 1))}</td>
                <td className="num">
                  {editable && l.approval === 'pending' && (
                    <button className="btn ghost small" onClick={() => setEditing(l)}>
                      {t('common.edit')}
                    </button>
                  )}
                  {editable && l.approval === 'pending' && !l.parts_request_id && (
                    <button
                      className="btn ghost small"
                      onClick={async () => {
                        if (confirm(t('common.confirm'))) await run(() => del(`/orders/${d.order.id}/lines/${l.id}`));
                        reload();
                      }}
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid2">
        <Totals totals={d.totals.approved} label={t('order.approvedTotal')} />
        {d.totals.pending.subtotal_cents > 0 && <Totals totals={d.totals.pending} label={t('order.pendingTotal')} />}
      </div>
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={t('common.edit')}>
        {editing && (
          <EditLine
            d={d}
            line={editing}
            onDone={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Sheet>
      <Sheet
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        title={adding ? t(({ labor: 'order.addLabor', part: 'order.addManualPart', fee: 'order.addFee', discount: 'order.addDiscount' } as const)[adding]) : ''}
      >
        {adding && (
          <AddLine
            d={d}
            kind={adding}
            onDone={() => {
              setAdding(null);
              reload();
            }}
          />
        )}
      </Sheet>
    </section>
  );
}

/** Opciones de disponibilidad en el proveedor y su plazo típico (en días). */
const AVAILABILITY = [
  ['in_stock', 0],
  ['next_day', 1],
  ['two_three_days', 3],
  ['on_order', 7],
  ['over_week', 14],
  ['unavailable', null],
] as const;
const AVAIL_KEYS: readonly string[] = AVAILABILITY.map(([k]) => k);

function Parts({ d, reload }: { d: any; reload: () => void }) {
  const { t, f } = useI18n();
  const toast = useToast();
  const suppliers = useLoad<any[]>('/suppliers');
  const { run, busy } = useAction();
  const [addPart, setAddPart] = useState(false);
  const [part, setPart] = useState({ description: '', part_number: '', quantity: '1' });
  const [ask, setAsk] = useState(false);
  const [askForm, setAskForm] = useState({ supplier_id: '', channel: 'none' });
  const [askText, setAskText] = useState('');
  const [offerFor, setOfferFor] = useState<any>(null);
  const [offer, setOffer] = useState({ supplier_id: '', cost: null as number | null, lead_days: '0', condition: 'new', channel: 'phone', availability: 'in_stock' });
  const [choosing, setChoosing] = useState<any>(null);
  const [clientPrice, setClientPrice] = useState<number | null>(null);
  const availLabel = (a: string) => (AVAIL_KEYS.includes(a) ? t(`order.avail.${a}` as Key) : a);
  const margin = d.settings.parts_margin_bp / 10000;
  const active = suppliers.data?.filter((s) => s.active) ?? [];
  const canEdit = EDITABLE.includes(d.order.status);
  const partTone: Record<string, string> = { pending: 's-off', quoted: 's-wait', chosen: 's-ok', ordered: 's-info', received: 's-ok' };

  return (
    <section className="section">
      <div className="row between">
        <h2>{t('order.parts')}</h2>
        {canEdit && (
          <div className="row">
            <button className="btn small" onClick={() => setAddPart(true)}>
              + {t('order.addPart')}
            </button>
            {d.parts.length > 0 && (
              <button className="btn small" onClick={() => (setAsk(true), setAskText(''))}>
                {t('order.askSupplier')}
              </button>
            )}
          </div>
        )}
      </div>
      {d.parts.length === 0 && <p className="muted">{t('common.none')}</p>}
      {d.parts.map((p: any) => (
        <div className="panel pad" key={p.id}>
          <div className="item-top">
            <strong>
              {p.quantity} × {p.description}
              {p.part_number && <span className="muted"> ({p.part_number})</span>}
            </strong>
            <span className={`status ${partTone[p.status]}`}>{t(`order.partStatus.${p.status}` as Key)}</span>
          </div>
          {p.offers.length > 0 && (
            <ul className="list">
              {p.offers.map((o: any) => (
                <li key={o.id} className="item" style={o.availability === 'unavailable' ? { opacity: 0.55 } : undefined}>
                  <div className="item-top">
                    <span>
                      <strong>{o.supplier_name}</strong> — {f.money(o.unit_cost_cents)}
                    </span>
                    {o.chosen ? (
                      <span className="status s-ok">{t('order.chosen')}</span>
                    ) : (
                      ['pending', 'quoted', 'chosen'].includes(p.status) &&
                      o.availability !== 'unavailable' && (
                        <button
                          className="btn small"
                          disabled={busy}
                          onClick={() => {
                            setChoosing({ ...o, part: p });
                            setClientPrice(Math.round(o.unit_cost_cents * (1 + margin)));
                          }}
                        >
                          {t('order.choose')}
                        </button>
                      )
                    )}
                  </div>
                  <span className="muted small">
                    {t(`order.condition.${o.condition}` as Key)}
                    {o.availability && ` — ${availLabel(o.availability)}`}
                    {o.lead_days !== null && o.availability !== 'unavailable' && ` — ${t('order.leadDays')}: ${o.lead_days}`}
                    {o.availability !== 'unavailable' && ` — ${t('order.sellPrice', { p: f.money(Math.round(o.unit_cost_cents * (1 + margin))) })}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            {['pending', 'quoted', 'chosen'].includes(p.status) && (
              <button className="btn small" onClick={() => (setOfferFor(p), setOffer({ ...offer, supplier_id: active[0]?.id ?? '', cost: null, availability: 'in_stock', lead_days: '0' }))}>
                + {t('order.addOffer')}
              </button>
            )}
            {p.status === 'ordered' && (
              <button className="btn small" onClick={async () => (await run(() => patch(`/parts/${p.id}`, { status: 'received' }))) && reload()}>
                {t('order.markReceived')}
              </button>
            )}
          </div>
        </div>
      ))}

      <Sheet open={addPart} onClose={() => setAddPart(false)} title={t('order.addPart')}>
        <Input label={t('common.description')} value={part.description} onChange={(e) => setPart({ ...part, description: e.target.value })} />
        <div className="grid2">
          <Input label={`${t('order.partNumber')} (${t('common.optional')})`} value={part.part_number} onChange={(e) => setPart({ ...part, part_number: e.target.value })} />
          <Input label={t('common.quantity')} inputMode="decimal" value={part.quantity} onChange={(e) => setPart({ ...part, quantity: e.target.value })} />
        </div>
        <button
          className="btn primary"
          disabled={busy || !part.description}
          onClick={async () => {
            const r = await run(() => post(`/orders/${d.order.id}/parts`, { ...part, quantity: Number(part.quantity.replace(',', '.')) || 1 }));
            if (r) {
              setAddPart(false);
              setPart({ description: '', part_number: '', quantity: '1' });
              reload();
            }
          }}
        >
          {t('common.add')}
        </button>
      </Sheet>

      <Sheet open={ask} onClose={() => setAsk(false)} title={t('order.askSupplier')}>
        {active.length === 0 ? (
          <p className="notice">{t('order.noSuppliers')}</p>
        ) : (
          <>
            <Select label={t('order.supplier')} value={askForm.supplier_id} onChange={(e) => setAskForm({ ...askForm, supplier_id: e.target.value })}>
              <option value="">—</option>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select label={t('order.askVia')} value={askForm.channel} onChange={(e) => setAskForm({ ...askForm, channel: e.target.value })}>
              <option value="none">{t('order.askViaNone')}</option>
              <option value="email">{t('order.channel.email')}</option>
              <option value="sms">{t('order.channel.sms')}</option>
            </Select>
            <button
              className="btn primary"
              disabled={busy || !askForm.supplier_id}
              onClick={async () => {
                const r = await run(() => post(`/orders/${d.order.id}/parts/ask`, askForm));
                if (!r) return;
                setAskText(r.text);
                if (r.sent) toast(t('order.askSent', { s: r.supplier.name }));
                else {
                  await navigator.clipboard?.writeText(r.text).catch(() => {});
                  toast(t('order.askCopied'));
                }
              }}
            >
              {t('order.askSupplier')}
            </button>
            {askText && <textarea readOnly rows={7} value={askText} />}
          </>
        )}
      </Sheet>

      <Sheet open={Boolean(offerFor)} onClose={() => setOfferFor(null)} title={`${t('order.addOffer')} — ${offerFor?.description ?? ''}`}>
        {active.length === 0 ? (
          <p className="notice">{t('order.noSuppliers')}</p>
        ) : (
          <>
            <Select label={t('order.supplier')} value={offer.supplier_id} onChange={(e) => setOffer({ ...offer, supplier_id: e.target.value })}>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select
              label={t('order.availability')}
              value={offer.availability}
              onChange={(e) => {
                const days = AVAILABILITY.find(([k]) => k === e.target.value)?.[1];
                setOffer({ ...offer, availability: e.target.value, lead_days: days === null || days === undefined ? '' : String(days) });
              }}
            >
              {AVAILABILITY.map(([k]) => (
                <option key={k} value={k}>
                  {t(`order.avail.${k}` as Key)}
                </option>
              ))}
            </Select>
            <div className="grid2">
              <MoneyInput label={t('order.unitCost')} cents={offer.cost} onChange={(cost) => setOffer({ ...offer, cost })} hint={offer.cost ? t('order.sellPrice', { p: f.money(Math.round(offer.cost * (1 + margin))) }) : undefined} />
              {offer.availability !== 'unavailable' && (
                <Input label={t('order.leadDays')} inputMode="numeric" value={offer.lead_days} onChange={(e) => setOffer({ ...offer, lead_days: e.target.value })} />
              )}
            </div>
            <Seg
              label={t('order.condition')}
              value={offer.condition}
              onChange={(condition) => setOffer({ ...offer, condition })}
              options={(['new', 'used', 'rebuilt'] as const).map((c) => ({ value: c, label: t(`order.condition.${c}` as Key) }))}
            />
            <Select label={t('order.channel')} value={offer.channel} onChange={(e) => setOffer({ ...offer, channel: e.target.value })}>
              {(['phone', 'email', 'sms', 'other'] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`order.channel.${c}` as Key)}
                </option>
              ))}
            </Select>
            <button
              className="btn primary"
              disabled={busy || !offer.cost || !offer.supplier_id}
              onClick={async () => {
                const r = await run(() =>
                  post(`/parts/${offerFor.id}/offers`, {
                    supplier_id: offer.supplier_id,
                    unit_cost_cents: offer.cost,
                    lead_days: offer.availability === 'unavailable' || offer.lead_days === '' ? null : Number(offer.lead_days),
                    condition: offer.condition,
                    channel: offer.channel,
                    availability: offer.availability,
                  }),
                );
                if (r) {
                  setOfferFor(null);
                  reload();
                }
              }}
            >
              {t('common.save')}
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={Boolean(choosing)} onClose={() => setChoosing(null)} title={`${t('order.choose')} — ${choosing?.part.description ?? ''}`}>
        {choosing && (
          <>
            <p className="muted small">
              {choosing.supplier_name} — {t('order.unitCost')}: {f.money(choosing.unit_cost_cents)} — {t('order.suggestedPrice', { p: f.money(Math.round(choosing.unit_cost_cents * (1 + margin))) })}
            </p>
            <MoneyInput label={t('order.clientPrice')} cents={clientPrice} onChange={setClientPrice} hint={t('order.clientPriceHelp')} />
            {clientPrice !== null && clientPrice < choosing.unit_cost_cents && <p className="notice">{t('order.belowCost')}</p>}
            <button
              className="btn primary"
              disabled={busy || clientPrice === null}
              onClick={async () => {
                const r = await run(() => post(`/offers/${choosing.id}/choose`, { unit_price_cents: clientPrice }));
                if (r) {
                  setChoosing(null);
                  reload();
                }
              }}
            >
              {t('order.choose')}
            </button>
          </>
        )}
      </Sheet>
    </section>
  );
}

function Timer({ d, reload }: { d: any; reload: () => void }) {
  const { t } = useI18n();
  const { run } = useAction();
  const running = d.timers.find((x: any) => !x.ended_at);
  const ms = d.timers.reduce((s: number, x: any) => s + ((x.ended_at ? new Date(x.ended_at).getTime() : Date.now()) - new Date(x.started_at).getTime()), 0);
  const h = `${Math.floor(ms / 3600000)} h ${String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0')}`;
  if (!['diagnosis', 'in_repair', 'quality_check', 'approved'].includes(d.order.status) && !d.timers.length) return null;
  return (
    <div className="row">
      <button className={`btn small${running ? ' primary' : ''}`} onClick={async () => (await run(() => post(`/orders/${d.order.id}/timer`, { action: running ? 'stop' : 'start' }))) && reload()}>
        {running ? t('order.timerStop') : t('order.timerStart')}
      </button>
      {ms > 0 && <span className="muted">{t('order.timeSpent', { h })}</span>}
    </div>
  );
}

export function WorkTab({ d, reload }: { d: any; reload: () => void }) {
  return (
    <>
      <Timer d={d} reload={reload} />
      <Notes d={d} reload={reload} />
      <Parts d={d} reload={reload} />
      <Lines d={d} reload={reload} />
    </>
  );
}
