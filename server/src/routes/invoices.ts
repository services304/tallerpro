import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import type { Lang } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { invoicePdf } from '../lib/pdf.js';
import { createInvoice, maybeClose, syncInvoice } from '../services/orders.js';
import { moveStock } from '../services/inventory.js';

const uuid = z.string().uuid();

/** Registra un pago y actualiza el estado de la factura (y cierra la orden si corresponde). */
export async function recordPayment(
  c: any,
  invoiceId: string,
  p: { method: string; amount_cents: number; reference: string },
  userId: string | null,
  lang: Lang,
) {
  const inv = await one<{ id: string; order_id: string | null; total_cents: number; paid_cents: number; status: string }>(
    'SELECT id, order_id, total_cents, paid_cents, status FROM invoices WHERE id=$1 FOR UPDATE',
    [invoiceId],
    c,
  );
  if (!inv) throw notFound();
  if (inv.status === 'void') throw new AppError(409, 'invoice.void');
  const balance = inv.total_cents - inv.paid_cents;
  if (p.amount_cents > balance) throw new AppError(400, 'payment.exceeds', { balance: formatMoney(balance, lang) });
  await q(`INSERT INTO payments (invoice_id, method, amount_cents, reference, user_id) VALUES ($1,$2,$3,$4,$5)`, [invoiceId, p.method, p.amount_cents, p.reference, userId], c);
  const paid = inv.paid_cents + p.amount_cents;
  await q(`UPDATE invoices SET paid_cents=$2, status=$3 WHERE id=$1`, [invoiceId, paid, paid >= inv.total_cents ? 'paid' : 'partial'], c);
  if (inv.order_id) await maybeClose(c, inv.order_id);
  return { paid_cents: paid, balance_cents: inv.total_cents - paid };
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  /** Factura de reparación con todo lo aprobado (incluye el cargo de visita). */
  app.post('/orders/:id/invoice', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return tx((c) => createInvoice(c, id, 'repair', req.user!.id));
  });

  // ---------- Modificar la factura a mano (solo el dueño) ----------
  // Se cambian las líneas aprobadas de la orden y la factura se recalcula (impuestos, total, saldo).

  async function editableInvoice(c: any, invoiceId: string) {
    const inv = await one<{ id: string; order_id: string | null; status: string; order_status: string | null }>(
      `SELECT i.id, i.order_id, i.status, o.status AS order_status FROM invoices i LEFT JOIN orders o ON o.id=i.order_id WHERE i.id=$1 FOR UPDATE OF i`,
      [invoiceId],
      c,
    );
    if (!inv) throw notFound();
    if (inv.status === 'void') throw new AppError(409, 'invoice.void');
    if (!inv.order_id) throw new AppError(409, 'invoice.not_editable');
    if (inv.order_status === 'closed') throw new AppError(409, 'invoice.not_editable');
    return inv as typeof inv & { order_id: string };
  }

  const manualLine = z.object({
    kind: z.enum(['labor', 'part', 'fee', 'discount']),
    description: z.string().trim().min(1).max(300),
    quantity: z.number().positive().max(10_000),
    unit_price_cents: z.number().int().min(0).max(100_000_000),
    part_condition: z.enum(['new', 'used', 'rebuilt']).nullable().optional(),
  });

  app.post('/invoices/:id/lines', { preHandler: requireUser('admin') }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(manualLine, req.body);
    return tx(async (c) => {
      const inv = await editableInvoice(c, id);
      const pos = await one<{ p: number }>('SELECT COALESCE(max(position),0)+1 AS p FROM order_lines WHERE order_id=$1', [inv.order_id], c);
      const line = await one<{ id: string }>(
        `INSERT INTO order_lines (order_id, kind, description, quantity, unit_price_cents, part_condition, approval, position)
         VALUES ($1,$2,$3,$4,$5,$6,'approved',$7) RETURNING id`,
        [inv.order_id, b.kind, b.description, b.quantity, b.unit_price_cents, b.kind === 'part' ? b.part_condition ?? 'new' : null, pos!.p],
        c,
      );
      await audit(req, 'invoice.line_add', 'invoice', id, null, b, c);
      const r = await syncInvoice(c, inv.order_id);
      return { line_id: line!.id, total_cents: r?.total_cents };
    });
  });

  app.patch('/invoices/:id/lines/:lineId', { preHandler: requireUser('admin') }, async (req) => {
    const p = parse(z.object({ id: uuid, lineId: uuid }), req.params);
    const b = parse(manualLine.partial(), req.body);
    return tx(async (c) => {
      const inv = await editableInvoice(c, p.id);
      const cur = await one<any>(`SELECT * FROM order_lines WHERE id=$1 AND order_id=$2 AND approval='approved' FOR UPDATE`, [p.lineId, inv.order_id], c);
      if (!cur) throw notFound();
      const m = { ...cur, ...b };
      // Pieza del inventario ya descontada: si cambia la cantidad, se ajusta la existencia.
      if (cur.stock_taken && cur.inventory_item_id && b.quantity !== undefined && Number(b.quantity) !== Number(cur.quantity)) {
        await moveStock(c, cur.inventory_item_id, Number(cur.quantity) - Number(b.quantity), 'adjust', { orderId: inv.order_id, lineId: cur.id, userId: req.user!.id, note: 'invoice edit' });
      }
      await q(
        `UPDATE order_lines SET kind=$2, description=$3, quantity=$4, unit_price_cents=$5, part_condition=$6 WHERE id=$1`,
        [cur.id, m.kind, m.description, m.quantity, m.unit_price_cents, m.kind === 'part' ? m.part_condition ?? 'new' : null],
        c,
      );
      await audit(req, 'invoice.line_edit', 'invoice', p.id, { description: cur.description, quantity: cur.quantity, unit_price_cents: cur.unit_price_cents }, b, c);
      const r = await syncInvoice(c, inv.order_id);
      return { ok: true, total_cents: r?.total_cents };
    });
  });

  app.delete('/invoices/:id/lines/:lineId', { preHandler: requireUser('admin') }, async (req) => {
    const p = parse(z.object({ id: uuid, lineId: uuid }), req.params);
    return tx(async (c) => {
      const inv = await editableInvoice(c, p.id);
      const cur = await one<any>(`SELECT * FROM order_lines WHERE id=$1 AND order_id=$2 AND approval='approved' FOR UPDATE`, [p.lineId, inv.order_id], c);
      if (!cur) throw notFound();
      const n = await one<{ n: number }>(`SELECT count(*)::int AS n FROM order_lines WHERE order_id=$1 AND approval='approved'`, [inv.order_id], c);
      if (n!.n <= 1) throw new AppError(409, 'invoice.last_line');
      if (cur.stock_taken && cur.inventory_item_id) {
        await moveStock(c, cur.inventory_item_id, Number(cur.quantity), 'return', { orderId: inv.order_id, userId: req.user!.id, note: 'invoice edit' });
      }
      await q('DELETE FROM order_lines WHERE id=$1', [cur.id], c);
      await audit(req, 'invoice.line_delete', 'invoice', p.id, { description: cur.description, quantity: cur.quantity, unit_price_cents: cur.unit_price_cents }, null, c);
      const r = await syncInvoice(c, inv.order_id);
      return { ok: true, total_cents: r?.total_cents };
    });
  });

  /** Pone la factura de la orden al día con todo lo aprobado. */
  app.post('/orders/:id/invoice/sync', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await tx((c) => syncInvoice(c, id));
    if (!r) throw notFound();
    return r;
  });

  app.get('/invoices', async (req) => {
    const b = parse(z.object({ status: z.enum(['issued', 'partial', 'paid', 'void', 'unpaid']).optional() }), req.query);
    return q(
      `SELECT i.id, i.number, i.kind, i.total_cents, i.paid_cents, i.status, i.issued_at, i.order_id,
              c.name AS client_name, c.lang AS client_lang, o.number AS order_number
         FROM invoices i JOIN clients c ON c.id=i.client_id LEFT JOIN orders o ON o.id=i.order_id
        WHERE ($1::text IS NULL OR i.status=$1 OR ($1='unpaid' AND i.status IN ('issued','partial')))
        ORDER BY i.number DESC LIMIT 300`,
      [b.status ?? null],
    );
  });

  app.get('/invoices/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const invoice = await one('SELECT * FROM invoices WHERE id=$1', [id]);
    if (!invoice) throw notFound();
    const [lines, payments, credits] = await Promise.all([
      q('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY position', [id]),
      q('SELECT * FROM payments WHERE invoice_id=$1 ORDER BY paid_at', [id]),
      q('SELECT * FROM credit_notes WHERE invoice_id=$1 ORDER BY created_at', [id]),
    ]);
    return { invoice, lines, payments, credits };
  });

  app.get('/invoices/:id/pdf', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { lang } = parse(z.object({ lang: z.enum(['fr', 'en', 'es']).optional() }), req.query);
    const { buf, number } = await invoicePdf(id, lang);
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="facture-${number}.pdf"`);
    return reply.send(buf);
  });

  app.post('/invoices/:id/payments', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        method: z.enum(['cash', 'interac', 'card', 'debit', 'cheque']),
        amount_cents: z.number().int().positive().max(100_000_000),
        reference: z.string().trim().max(120).default(''),
      }),
      req.body,
    );
    return tx((c) => recordPayment(c, id, b, req.user!.id, req.lang));
  });

  /** Una factura emitida no se borra: se anula con una nota de crédito por el total. */
  app.post('/invoices/:id/void', { preHandler: requireUser('admin') }, async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body);
    await tx(async (c) => {
      const inv = await one<{ total_cents: number; status: string; paid_cents: number }>('SELECT total_cents, status, paid_cents FROM invoices WHERE id=$1 FOR UPDATE', [id], c);
      if (!inv) throw notFound();
      if (inv.status === 'void') throw new AppError(409, 'invoice.void');
      await q(`INSERT INTO credit_notes (invoice_id, reason, amount_cents, user_id) VALUES ($1,$2,$3,$4)`, [id, reason, inv.total_cents, req.user!.id], c);
      await q(`UPDATE invoices SET status='void' WHERE id=$1`, [id], c);
      await audit(req, 'invoice.void', 'invoice', id, inv, { reason }, c);
    });
    return { ok: true };
  });
}
