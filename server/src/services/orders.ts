import type pg from 'pg';
import { type Db, one, q } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import { docLabels, statusLabels, type Lang, type NotificationEvent } from '../lib/i18n.js';
import { computeTotals, formatMoney } from '../lib/money.js';
import { enqueue } from '../lib/notify.js';
import { canTransition, type OrderStatus } from '../lib/orderStates.js';
import { returnStockForOrder, takeStockForOrder } from './inventory.js';

export type Actor = { kind: 'staff'; userId: string } | { kind: 'client' } | { kind: 'system' };

/** Número de orden: OR-2026-0001 (consecutivo por año). */
export async function nextOrderNumber(db: Db): Promise<string> {
  const year = new Date().getFullYear();
  const r = await one<{ value: number }>(
    `INSERT INTO counters (name, value) VALUES ($1, 1)
     ON CONFLICT (name) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    [`order-${year}`],
    db,
  );
  return `OR-${year}-${String(r!.value).padStart(4, '0')}`;
}

/** Número de factura consecutivo y sin huecos (dentro de la misma transacción). */
export async function nextInvoiceNumber(db: Db): Promise<number> {
  const r = await one<{ value: number }>(`UPDATE counters SET value = value + 1 WHERE name='invoice' RETURNING value`, [], db);
  return r!.value;
}

export function vehicleLabel(v: { make?: string; model?: string; year?: number | null }): string {
  return [v.make, v.model, v.year].filter(Boolean).join(' ') || '—';
}

/** Cambia el estado de una orden validando la transición y guardando el historial. */
export async function transition(db: Db, orderId: string, to: OrderStatus, actor: Actor, note = ''): Promise<OrderStatus> {
  const o = await one<{ status: OrderStatus }>('SELECT status FROM orders WHERE id=$1 FOR UPDATE', [orderId], db);
  if (!o) throw notFound();
  if (!canTransition(o.status, to)) {
    throw new AppError(409, 'order.bad_transition', { from: o.status, to });
  }
  await q(
    `UPDATE orders SET status=$2, updated_at=now(), closed_at = CASE WHEN $2 IN ('closed','cancelled') THEN now() ELSE closed_at END WHERE id=$1`,
    [orderId, to],
    db,
  );
  await q(
    `INSERT INTO order_status_history (order_id, from_status, to_status, user_id, actor, note, created_at) VALUES ($1,$2,$3,$4,$5,$6, clock_timestamp())`,
    [orderId, o.status, to, actor.kind === 'staff' ? actor.userId : null, actor.kind, note],
    db,
  );
  // Orden cancelada: las piezas que se habían sacado del inventario vuelven a él.
  if (to === 'cancelled') await returnStockForOrder(db, orderId, actor.kind === 'staff' ? actor.userId : null, 'cancelled');
  return o.status;
}

export async function getSettings(db: Db) {
  return (await one<{
    shop_name: string; shop_address: string; shop_phone: string; shop_email: string; taxes_registered: boolean;
    gst_number: string; qst_number: string; visit_fee_cents: number; labor_rate_cents: number; parts_margin_bp: number;
    quote_valid_days: number; default_lang: Lang; warranty_text: Record<Lang, string>;
  }>('SELECT * FROM settings WHERE id=1', [], db))!;
}

/** Totales (con impuestos) de las líneas aprobadas de una orden. */
export async function approvedTotals(db: Db, orderId: string) {
  const s = await getSettings(db);
  const lines = await q('SELECT kind, quantity, unit_price_cents FROM order_lines WHERE order_id=$1 AND approval=$2', [orderId, 'approved'], db);
  return computeTotals(lines, s.taxes_registered);
}

async function orderContext(db: Db, orderId: string) {
  return one<{ id: string; number: string; client_id: string; lang: Lang; make: string; model: string; year: number | null }>(
    `SELECT o.id, o.number, o.client_id, c.lang, v.make, v.model, v.year
       FROM orders o JOIN clients c ON c.id=o.client_id JOIN vehicles v ON v.id=o.vehicle_id WHERE o.id=$1`,
    [orderId],
    db,
  );
}

/** Pone en cola un aviso al cliente sobre su orden, con enlace al portal. */
export async function notifyOrder(db: Db, orderId: string, event: NotificationEvent, extra: Record<string, string | number> = {}) {
  const o = await orderContext(db, orderId);
  if (!o) return 0;
  return enqueue(
    { event, clientId: o.client_id, orderId, withLink: true, vars: { order: o.number, vehicle: vehicleLabel(o), ...extra } },
    db,
  );
}

export function moneyFor(lang: Lang, cents: number) {
  return formatMoney(cents, lang);
}

/**
 * Crea una factura con las líneas aprobadas de la orden.
 * kind='inspection' es la factura de revisión cuando el cliente rechaza la cotización.
 */
type BillLine = { kind: string; description: string; quantity: number; unit_price_cents: number; part_condition: string | null };

function approvedLines(db: pg.PoolClient, orderId: string) {
  return q<BillLine & { position: number }>(
    `SELECT kind, description, quantity, unit_price_cents, part_condition, position FROM order_lines
      WHERE order_id=$1 AND approval='approved' ORDER BY position, created_at`,
    [orderId],
    db,
  );
}

async function fillInvoiceLines(db: pg.PoolClient, invoiceId: string, lines: BillLine[]) {
  await q('DELETE FROM invoice_lines WHERE invoice_id=$1', [invoiceId], db);
  let pos = 0;
  for (const l of lines) {
    const total = Math.round(l.quantity * l.unit_price_cents) * (l.kind === 'discount' ? -1 : 1);
    await q(
      `INSERT INTO invoice_lines (invoice_id, kind, description, quantity, unit_price_cents, total_cents, part_condition, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [invoiceId, l.kind, l.description, l.quantity, l.unit_price_cents, total, l.part_condition, pos++],
      db,
    );
  }
}

/**
 * Pone al día la factura activa de la orden con todo lo aprobado (repuestos, mano de obra, cargos).
 * Conserva el número y los pagos; recalcula impuestos, total y estado. Devuelve null si no hay factura.
 */
export async function syncInvoice(db: pg.PoolClient, orderId: string) {
  const inv = await one<{ id: string; number: number; kind: string; paid_cents: number; total_cents: number; lang: Lang }>(
    `SELECT id, number, kind, paid_cents, total_cents, lang FROM invoices WHERE order_id=$1 AND status <> 'void' ORDER BY number DESC LIMIT 1 FOR UPDATE`,
    [orderId],
    db,
  );
  if (!inv) return null;
  const lines = await approvedLines(db, orderId);
  if (!lines.length) return { id: inv.id, number: inv.number, changed: false, total_cents: inv.total_cents };
  const s = await getSettings(db);
  const t = computeTotals(lines, s.taxes_registered);
  // Si ya hay trabajo aprobado además del cargo de visita, deja de ser solo una «revisión».
  const kind = lines.some((l) => l.kind === 'part' || l.kind === 'labor') ? 'repair' : inv.kind;
  const status = inv.paid_cents <= 0 ? 'issued' : inv.paid_cents >= t.total_cents ? 'paid' : 'partial';
  await q(
    `UPDATE invoices SET kind=$2, subtotal_cents=$3, gst_cents=$4, qst_cents=$5, total_cents=$6, status=$7,
            warranty_text=CASE WHEN $2='repair' AND warranty_text='' THEN $8 ELSE warranty_text END
      WHERE id=$1`,
    [inv.id, kind, t.subtotal_cents, t.gst_cents, t.qst_cents, t.total_cents, status, s.warranty_text[inv.lang] ?? s.warranty_text.fr ?? ''],
    db,
  );
  await fillInvoiceLines(db, inv.id, lines);
  return { id: inv.id, number: inv.number, changed: t.total_cents !== inv.total_cents, total_cents: t.total_cents };
}

export async function createInvoice(db: pg.PoolClient, orderId: string, kind: 'repair' | 'inspection', userId: string | null) {
  const existing = await one<{ number: number }>(
    `SELECT number FROM invoices WHERE order_id=$1 AND status <> 'void'`,
    [orderId],
    db,
  );
  if (existing) throw new AppError(409, 'invoice.exists', { number: existing.number });
  const o = await one<{ client_id: string; lang: Lang }>('SELECT o.client_id, c.lang FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.id=$1', [orderId], db);
  if (!o) throw notFound();
  const s = await getSettings(db);
  const lines = await approvedLines(db, orderId);
  if (!lines.length) throw new AppError(409, 'invoice.nothing');
  const totals = computeTotals(lines, s.taxes_registered);
  const number = await nextInvoiceNumber(db);
  const inv = await one<{ id: string; number: number; total_cents: number }>(
    `INSERT INTO invoices (number, order_id, client_id, kind, lang, subtotal_cents, gst_cents, qst_cents, total_cents,
                           gst_number, qst_number, warranty_text, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, number, total_cents`,
    [
      number, orderId, o.client_id, kind, o.lang, totals.subtotal_cents, totals.gst_cents, totals.qst_cents, totals.total_cents,
      s.taxes_registered ? s.gst_number : '', s.taxes_registered ? s.qst_number : '',
      kind === 'repair' ? s.warranty_text[o.lang] ?? s.warranty_text.fr ?? '' : '', userId,
    ],
    db,
  );
  await fillInvoiceLines(db, inv!.id, lines);
  return inv!;
}

/** Cierra la orden si ya fue entregada y todas sus facturas están pagadas. */
export async function maybeClose(db: Db, orderId: string) {
  const o = await one<{ status: OrderStatus }>('SELECT status FROM orders WHERE id=$1', [orderId], db);
  if (o?.status !== 'delivered') return false;
  const pending = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM invoices WHERE order_id=$1 AND status IN ('issued','partial')`,
    [orderId],
    db,
  );
  const any = await one<{ n: number }>(`SELECT count(*)::int AS n FROM invoices WHERE order_id=$1 AND status <> 'void'`, [orderId], db);
  if (pending!.n === 0 && any!.n > 0) {
    await transition(db, orderId, 'closed', { kind: 'system' });
    return true;
  }
  return false;
}

/**
 * Registra la decisión del cliente sobre una cotización (desde el portal o en persona).
 * - Todo aprobado → orden «aprobada».
 * - Algo aprobado → «aprobada» con las líneas rechazadas fuera.
 * - Todo rechazado → «rechazada», factura de revisión automática y orden «lista para recoger».
 */
export async function decideQuote(
  db: pg.PoolClient,
  quoteId: string,
  decisions: Record<string, 'approved' | 'rejected'>,
  actor: Actor,
  meta: { ip?: string; signatureId?: string | null } = {},
) {
  const quote = await one<{ id: string; order_id: string; status: string }>('SELECT id, order_id, status FROM quotes WHERE id=$1 FOR UPDATE', [quoteId], db);
  if (!quote) throw notFound();
  if (quote.status !== 'sent') throw new AppError(409, 'quote.not_pending');
  const lines = await q<{ id: string; order_line_id: string | null }>('SELECT id, order_line_id FROM quote_lines WHERE quote_id=$1', [quoteId], db);
  if (lines.some((l) => !decisions[l.id])) throw new AppError(400, 'quote.decide_all');

  for (const l of lines) {
    const d = decisions[l.id]!;
    await q('UPDATE quote_lines SET decision=$2 WHERE id=$1', [l.id, d], db);
    if (l.order_line_id) await q('UPDATE order_lines SET approval=$2 WHERE id=$1', [l.order_line_id, d], db);
  }
  const approvedCount = lines.filter((l) => decisions[l.id] === 'approved').length;
  const status = approvedCount === lines.length ? 'approved' : approvedCount === 0 ? 'rejected' : 'partial';
  await q(
    `UPDATE quotes SET status=$2, decided_at=now(), decided_by=$3, decided_ip=$4, signature_id=$5 WHERE id=$1`,
    [quoteId, status, actor.kind === 'client' ? 'client' : 'staff', meta.ip ?? null, meta.signatureId ?? null],
    db,
  );

  // Si ya existe una factura (p. ej. creada antes con solo el cargo de visita), se pone al día.
  if (approvedCount > 0) await syncInvoice(db, quote.order_id);
  // Las piezas del inventario aprobadas salen de la existencia.
  if (approvedCount > 0) await takeStockForOrder(db, quote.order_id, actor.kind === 'staff' ? actor.userId : null);

  // Los repuestos aprobados pasan a «pedidos» (la oferta elegida se convierte en orden de compra).
  await q(
    `UPDATE parts_requests SET status='ordered' WHERE id IN (
       SELECT parts_request_id FROM order_lines WHERE order_id=$1 AND approval='approved' AND parts_request_id IS NOT NULL)
     AND status='chosen'`,
    [quote.order_id],
    db,
  );

  // Cotización complementaria (trabajo adicional) rechazada: el trabajo ya aprobado sigue adelante.
  const earlierApproved = await one(
    `SELECT 1 FROM quotes WHERE order_id=$1 AND id<>$2 AND status IN ('approved','partial')`,
    [quote.order_id, quoteId],
    db,
  );
  if (status === 'rejected' && earlierApproved) {
    await transition(db, quote.order_id, 'approved', actor, 'additional work declined');
    return { status, invoice: null };
  }

  if (status === 'rejected') {
    await transition(db, quote.order_id, 'rejected', actor);
    let invoice: { id: string; number: number; total_cents: number } | null = null;
    try {
      invoice = await createInvoice(db, quote.order_id, 'inspection', actor.kind === 'staff' ? actor.userId : null);
    } catch (e) {
      // Sin nada que cobrar, o ya existía una factura: se deja como está.
      if (!(e instanceof AppError && (e.code === 'invoice.nothing' || e.code === 'invoice.exists'))) throw e;
    }
    await transition(db, quote.order_id, 'ready', { kind: 'system' });
    const ctx = await orderContext(db, quote.order_id);
    await notifyOrder(db, quote.order_id, 'inspection_invoice', { total: moneyFor(ctx!.lang, invoice?.total_cents ?? 0) });
    return { status, invoice };
  }
  await transition(db, quote.order_id, 'approved', actor);
  await notifyOrder(db, quote.order_id, 'quote_approved');
  return { status, invoice: null };
}

export function statusLabel(lang: Lang, s: string) {
  return statusLabels[lang][s] ?? s;
}

export function lineKindLabel(lang: Lang, kind: string) {
  return docLabels[lang][kind] ?? kind;
}
