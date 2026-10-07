import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import type { Lang } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { invoicePdf } from '../lib/pdf.js';
import { createInvoice, maybeClose } from '../services/orders.js';

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

  app.get('/invoices', async (req) => {
    const b = parse(z.object({ status: z.enum(['issued', 'partial', 'paid', 'void', 'unpaid']).optional() }), req.query);
    return q(
      `SELECT i.id, i.number, i.kind, i.total_cents, i.paid_cents, i.status, i.issued_at, i.order_id,
              c.name AS client_name, o.number AS order_number
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
