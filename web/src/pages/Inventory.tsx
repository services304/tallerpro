import { useState } from 'react';
import { Link } from 'react-router';
import { patch, post } from '../api';
import { Check, Empty, Input, LoadError, Loading, MoneyInput, Seg, Select, Sheet, TextArea, useAction, useLoad, useToast } from '../components/ui';
import { useI18n, type Key } from '../i18n';

export const INV_CATEGORIES = ['fluids', 'filters', 'brakes', 'electrical', 'ignition', 'engine', 'suspension', 'tires', 'hardware', 'other'] as const;
export const INV_UNITS = ['unit', 'l', 'qt', 'kg', 'm', 'box', 'set'] as const;

const blank = { name: '', part_number: '', category: 'other', unit: 'unit', location: 'van', quantity: '', min_quantity: '', cost_cents: null as number | null, price_cents: null as number | null, supplier_id: '', notes: '', active: true };

/** Texto de cantidad con su unidad: «4,5 L», «3 u.». */
export function useQty() {
  const { t, f } = useI18n();
  return (n: number, unit: string) => `${f.number(n)} ${t(`inv.unitShort.${unit}` as Key)}`;
}

export function Inventory() {
  const { t, f } = useI18n();
  const toast = useToast();
  const qty = useQty();
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [search, setSearch] = useState('');
  const list = useLoad<any[]>(`/inventory?${filter === 'low' ? 'low=1&' : ''}all=1${search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ''}`, [filter, search]);
  const summary = useLoad<any>('/inventory/summary');
  const suppliers = useLoad<any[]>('/suppliers');
  const { run, busy } = useAction();
  const [edit, setEdit] = useState<any>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useLoad<any>(openId ? `/inventory/${openId}` : null, [openId]);
  const [move, setMove] = useState<null | { kind: 'purchase' | 'adjust' | 'count'; quantity: string; cost: number | null; supplier_id: string; note: string; sign: '+' | '-' }>(null);

  const reloadAll = () => {
    list.reload();
    summary.reload();
    if (openId) detail.reload();
  };

  async function save() {
    const body: any = {
      name: edit.name,
      part_number: edit.part_number,
      category: edit.category,
      unit: edit.unit,
      location: edit.location,
      min_quantity: Number(String(edit.min_quantity).replace(',', '.')) || 0,
      cost_cents: edit.cost_cents ?? 0,
      price_cents: edit.price_cents ?? 0,
      supplier_id: edit.supplier_id || null,
      notes: edit.notes,
      active: edit.active,
    };
    if (!edit.id) body.quantity = Number(String(edit.quantity).replace(',', '.')) || 0;
    const r = await run(() => (edit.id ? patch(`/inventory/${edit.id}`, body) : post('/inventory', body)), t('common.saved'));
    if (r) {
      setEdit(null);
      reloadAll();
    }
  }

  async function saveMove() {
    if (!move || !openId) return;
    let n = Number(move.quantity.replace(',', '.'));
    if (!Number.isFinite(n)) return;
    if (move.kind === 'adjust' && move.sign === '-') n = -Math.abs(n);
    const r = await run(() =>
      post(`/inventory/${openId}/movements`, {
        kind: move.kind,
        quantity: n,
        unit_cost_cents: move.kind === 'purchase' ? move.cost ?? undefined : undefined,
        supplier_id: move.kind === 'purchase' ? move.supplier_id || null : null,
        note: move.note,
      }),
    );
    if (r) {
      toast(t('inv.moved'));
      setMove(null);
      reloadAll();
    }
  }

  const data = list.data ?? [];
  const cats = INV_CATEGORIES.filter((c) => data.some((i) => i.category === c));
  const item = detail.data?.item;
  const activeSuppliers = suppliers.data?.filter((s) => s.active) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('inv.title')}</h1>
          <p className="muted">{t('inv.help')}</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({ ...blank, supplier_id: '' })}>
          {t('common.add')}
        </button>
      </div>

      {summary.data && summary.data.items > 0 && (
        <div className="figures">
          <div>
            <strong>{summary.data.items}</strong>
            <span>{t('inv.items')}</span>
          </div>
          <div>
            <strong>{f.money(summary.data.value_cents)}</strong>
            <span>{t('inv.valueAtCost')}</span>
          </div>
          <div>
            <strong className={summary.data.low > 0 ? 'warn-text' : ''}>{summary.data.low}</strong>
            <span>{t('inv.lowStock')}</span>
          </div>
        </div>
      )}

      <div className="row">
        <Seg
          label={t('inv.title')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('orders.all') },
            { value: 'low', label: t('inv.lowStock') },
          ]}
        />
        <a className="btn small" href="/api/inventory.csv" download>
          {t('inv.exportCsv')}
        </a>
      </div>
      <Input label={t('common.search')} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('inv.searchHint')} />

      {list.loading && !list.data && <Loading />}
      {list.error && <LoadError error={list.error} retry={list.reload} />}
      {list.data?.length === 0 && <Empty>{filter === 'low' ? t('inv.noneLow') : search ? t('common.none') : t('inv.empty')}</Empty>}

      {cats.map((c) => (
        <section className="section" key={c}>
          <h2>{t(`inv.cat.${c}` as Key)}</h2>
          <ul className="list">
            {data
              .filter((i) => i.category === c)
              .map((i) => {
                const low = i.quantity <= i.min_quantity;
                return (
                  <li key={i.id}>
                    <button
                      className="item"
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', opacity: i.active ? 1 : 0.5 }}
                      onClick={() => setOpenId(i.id)}
                    >
                      <div className="item-top">
                        <span className="item-title">{i.name}</span>
                        <strong className={low ? 'warn-text' : ''}>{qty(i.quantity, i.unit)}</strong>
                      </div>
                      <span className="muted small">
                        {[i.part_number, t(`inv.loc.${i.location}` as Key), `${t('inv.price')}: ${f.money(i.price_cents)}`].filter(Boolean).join(' — ')}
                        {i.reserved > 0 && ` — ${t('inv.reserved', { n: qty(i.reserved, i.unit) })}`}
                      </span>
                      {low && i.active && <span className="status s-wait">{t('inv.belowMin', { n: qty(i.min_quantity, i.unit) })}</span>}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}

      {/* Detalle del artículo con su historial */}
      <Sheet open={Boolean(openId)} onClose={() => (setOpenId(null), setMove(null))} title={item?.name ?? ''}>
        {detail.loading && !item && <Loading />}
        {item && (
          <>
            <div className="figures">
              <div>
                <strong className={item.quantity <= item.min_quantity ? 'warn-text' : ''}>{qty(item.quantity, item.unit)}</strong>
                <span>{t('inv.inStock')}</span>
              </div>
              <div>
                <strong>{f.money(item.cost_cents)}</strong>
                <span>{t('inv.avgCost')}</span>
              </div>
              <div>
                <strong>{f.money(item.price_cents)}</strong>
                <span>{t('inv.price')}</span>
              </div>
            </div>
            <p className="muted small">
              {[item.part_number && `${t('order.partNumber')}: ${item.part_number}`, t(`inv.loc.${item.location}` as Key), `${t('inv.min')}: ${qty(item.min_quantity, item.unit)}`, item.supplier_name]
                .filter(Boolean)
                .join(' — ')}
              {item.reserved > 0 && ` — ${t('inv.reserved', { n: qty(item.reserved, item.unit) })}`}
            </p>
            <div className="row">
              <button className="btn primary small" onClick={() => setMove({ kind: 'purchase', quantity: '', cost: item.cost_cents || null, supplier_id: item.supplier_id ?? '', note: '', sign: '+' })}>
                + {t('inv.move.purchase')}
              </button>
              <button className="btn small" onClick={() => setMove({ kind: 'adjust', quantity: '', cost: null, supplier_id: '', note: '', sign: '-' })}>
                {t('inv.move.adjust')}
              </button>
              <button className="btn small" onClick={() => setMove({ kind: 'count', quantity: String(item.quantity), cost: null, supplier_id: '', note: '', sign: '+' })}>
                {t('inv.move.count')}
              </button>
              <button className="btn ghost small" onClick={() => setEdit({ ...item, supplier_id: item.supplier_id ?? '', min_quantity: String(item.min_quantity) })}>
                {t('common.edit')}
              </button>
            </div>

            {move && (
              <div className="panel pad stack">
                <strong>{t(`inv.move.${move.kind}` as Key)}</strong>
                {move.kind === 'adjust' && (
                  <Seg
                    label={t('inv.move.adjust')}
                    value={move.sign}
                    onChange={(sign) => setMove({ ...move, sign })}
                    options={[
                      { value: '-', label: t('inv.remove') },
                      { value: '+', label: t('inv.addStock') },
                    ]}
                  />
                )}
                <Input
                  label={move.kind === 'count' ? t('inv.realQty', { u: t(`inv.unitShort.${item.unit}` as Key) }) : t('inv.qty', { u: t(`inv.unitShort.${item.unit}` as Key) })}
                  inputMode="decimal"
                  value={move.quantity}
                  onChange={(e) => setMove({ ...move, quantity: e.target.value })}
                  autoFocus
                />
                {move.kind === 'purchase' && (
                  <>
                    <MoneyInput label={t('inv.unitCost')} cents={move.cost} onChange={(cost) => setMove({ ...move, cost })} hint={t('inv.avgHint')} />
                    {activeSuppliers.length > 0 && (
                      <Select label={t('order.supplier')} value={move.supplier_id} onChange={(e) => setMove({ ...move, supplier_id: e.target.value })}>
                        <option value="">—</option>
                        {activeSuppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </>
                )}
                <Input
                  label={`${move.kind === 'adjust' ? t('inv.reason') : t('common.notes')}${move.kind === 'adjust' ? '' : ` (${t('common.optional')})`}`}
                  value={move.note}
                  onChange={(e) => setMove({ ...move, note: e.target.value })}
                  placeholder={move.kind === 'adjust' ? t('inv.reasonHint') : ''}
                />
                <div className="row">
                  <button className="btn primary" disabled={busy || move.quantity.trim() === '' || (move.kind === 'adjust' && move.note.trim().length < 2)} onClick={saveMove}>
                    {t('common.save')}
                  </button>
                  <button className="btn ghost" onClick={() => setMove(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            <h3>{t('inv.history')}</h3>
            {detail.data.movements.length === 0 ? (
              <p className="muted">{t('common.none')}</p>
            ) : (
              <ul className="list">
                {detail.data.movements.map((m: any) => (
                  <li key={m.id} className="item">
                    <div className="item-top">
                      <span>
                        {t(`inv.kind.${m.kind}` as Key)}
                        {m.order_number && (
                          <>
                            {' — '}
                            <Link to={`/orders/${m.order_id}`}>{m.order_number}</Link>
                          </>
                        )}
                      </span>
                      <strong className={m.quantity < 0 ? 'warn-text' : 'ok-text'}>
                        {m.quantity > 0 ? '+' : ''}
                        {f.number(m.quantity)}
                      </strong>
                    </div>
                    <span className="muted small">
                      {f.dateTime(m.created_at)} — {t('inv.balance')}: {qty(m.balance, item.unit)}
                      {m.kind === 'purchase' && m.unit_cost_cents != null && ` — ${f.money(m.unit_cost_cents)}/${t(`inv.unitShort.${item.unit}` as Key)}`}
                      {m.supplier_name && ` — ${m.supplier_name}`}
                      {m.note && m.note !== 'cancelled' && ` — ${m.note}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Sheet>

      {/* Crear o editar */}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('inv.new')}>
        {edit && (
          <>
            <Input label={t('common.name')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t('inv.nameHint')} />
            <div className="grid2">
              <Input label={`${t('order.partNumber')} (${t('common.optional')})`} value={edit.part_number} onChange={(e) => setEdit({ ...edit, part_number: e.target.value })} />
              <Select label={t('workTypes.category')} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                {INV_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`inv.cat.${c}` as Key)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid2">
              <Select label={t('inv.unit')} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })}>
                {INV_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`inv.unitName.${u}` as Key)}
                  </option>
                ))}
              </Select>
              <Select label={t('inv.location')} value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })}>
                <option value="van">{t('inv.loc.van')}</option>
                <option value="shop">{t('inv.loc.shop')}</option>
              </Select>
            </div>
            <div className="grid2">
              {!edit.id && <Input label={t('inv.startQty')} inputMode="decimal" value={edit.quantity} onChange={(e) => setEdit({ ...edit, quantity: e.target.value })} />}
              <Input label={t('inv.min')} inputMode="decimal" value={edit.min_quantity} onChange={(e) => setEdit({ ...edit, min_quantity: e.target.value })} hint={t('inv.minHint')} />
            </div>
            <div className="grid2">
              <MoneyInput label={t('inv.unitCost')} cents={edit.cost_cents} onChange={(cost_cents) => setEdit({ ...edit, cost_cents })} />
              <MoneyInput label={t('inv.price')} cents={edit.price_cents} onChange={(price_cents) => setEdit({ ...edit, price_cents })} />
            </div>
            {edit.cost_cents > 0 && edit.price_cents > 0 && (
              <p className="muted small">{t('inv.marginIs', { p: `${Math.round(((edit.price_cents - edit.cost_cents) / edit.cost_cents) * 100)} %` })}</p>
            )}
            {activeSuppliers.length > 0 && (
              <Select label={`${t('order.supplier')} (${t('common.optional')})`} value={edit.supplier_id} onChange={(e) => setEdit({ ...edit, supplier_id: e.target.value })}>
                <option value="">—</option>
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
            <TextArea label={`${t('common.notes')} (${t('common.optional')})`} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            {edit.id && <Check label={t('workTypes.active')} checked={edit.active} onChange={(active) => setEdit({ ...edit, active })} />}
            <button className="btn primary" disabled={busy || !edit.name.trim()} onClick={save}>
              {t('common.save')}
            </button>
          </>
        )}
      </Sheet>
    </>
  );
}
