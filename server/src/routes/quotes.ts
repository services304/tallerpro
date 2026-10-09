import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import type { Lang } from '../lib/i18n.js';
import { computeTotals, lineTotal } from '../lib/money.js';
import type { OrderStatus } from '../lib/orderStates.js';
import { quotePdf } from '../lib/pdf.js';
import { decideQuote, getSettings, moneyFor, notifyOrder, transition } from '../services/orders.js';
import { saveSignature } from './media.js';

const uuid = z.string().uuid();

export async function quoteRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  /**
   * Envía la cotización al cliente con las líneas pendientes de aprobar.
   * Requiere que cada repuesto pedido tenga una oferta de proveedor elegida.
   */
  app.post('/orders/:id/quotes', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ notify: z.boolean().default(true) }), req.body ?? {});
    return tx(async (c) => {
      const o = await one<{ status: OrderStatus; client_id: string; lang: Lang }>(
        'SELECT o.status, o.client_id, c.lang FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.id=$1 FOR UPDATE OF o',
        [id],
        c,
      );
      if (!o) throw notFound();
      if (!['diagnosis', 'parts_quote', 'quote_sent'].includes(o.status)) throw new AppError(409, 'order.bad_transition', { from: o.status, to: 'quote_sent' });
      const missing = await q<{ description: string }>(
        `SELECT description FROM parts_requests pr WHERE order_id=$1 AND status IN ('pending','quoted')
           AND NOT EXISTS (SELECT 1 FROM order_lines l WHERE l.parts_request_id=pr.id AND l.approval<>'pending')`,
        [id],
        c,
      );
      if (missing.length) throw new AppError(409, 'quote.offer_missing', { parts: missing.map((m) => m.description).join(', ') });
      const lines = await q<any>(`SELECT * FROM order_lines WHERE order_id=$1 AND approval='pending' ORDER BY position, created_at`, [id], c);
      if (!lines.length) throw new AppError(409, 'quote.no_lines');
      const s = await getSettings(c);
      const totals = computeTotals(lines, s.taxes_registered);
      await q(`UPDATE quotes SET status='superseded' WHERE order_id=$1 AND status='sent'`, [id], c);
      const v = await one<{ v: number }>('SELECT COALESCE(max(version),0)+1 AS v FROM quotes WHERE order_id=$1', [id], c);
      const quote = await one<{ id: string; version: number; total_cents: number }>(
        `INSERT INTO quotes (order_id, version, subtotal_cents, gst_cents, qst_cents, total_cents, valid_until, created_by)
         VALUES ($1,$2,$3,$4,$5,$6, (now() AT TIME ZONE 'America/Toronto')::date + $7::int, $8) RETURNING id, version, total_cents`,
        [id, v!.v, totals.subtotal_cents, totals.gst_cents, totals.qst_cents, totals.total_cents, s.quote_valid_days, req.user!.id],
        c,
      );
      let pos = 0;
      for (const l of lines) {
        await q(
          `INSERT INTO quote_lines (quote_id, order_line_id, kind, description, quantity, unit_price_cents, total_cents, part_condition, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [quote!.id, l.id, l.kind, l.description, l.quantity, l.unit_price_cents, lineTotal(l.quantity, l.unit_price_cents, l.kind), l.part_condition, pos++],
          c,
        );
      }
      if (o.status !== 'quote_sent') await transition(c, id, 'quote_sent', { kind: 'staff', userId: req.user!.id });
      const notified = b.notify ? await notifyOrder(c, id, 'quote_ready', { total: moneyFor(o.lang, totals.total_cents) }) : 0;
      return { ...quote!, notified };
    });
  });

  /** Decisión registrada por el taller (p. ej. el cliente aprobó en persona o por teléfono). */
  app.post('/quotes/:id/decision', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        decisions: z.record(z.string().uuid(), z.enum(['approved', 'rejected'])),
        signer_name: z.string().trim().max(160).optional(),
        signature: z.string().max(900_000).optional(),
      }),
      req.body,
    );
    return tx(async (c) => {
      const qt = await one<{ order_id: string }>('SELECT order_id FROM quotes WHERE id=$1', [id], c);
      if (!qt) throw notFound();
      const sigId = b.signature && b.signer_name ? await saveSignature(qt.order_id, 'quote', b.signer_name, b.signature, { ip: req.ip, ua: req.headers['user-agent'] }, c) : null;
      return decideQuote(c, id, b.decisions, { kind: 'staff', userId: req.user!.id }, { ip: req.ip, signatureId: sigId });
    });
  });

  /**
   * Volver a cotizar después de un rechazo: los trabajos rechazados vuelven a «pendiente»,
   * la orden vuelve a diagnóstico y se puede mandar una cotización nueva (precios o trabajos distintos).
   * La factura de la visita queda; si el cliente aprueba, se convierte sola en factura de reparación.
   */
  app.post('/orders/:id/requote', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return tx(async (c) => {
      const o = await one<{ status: string }>('SELECT status FROM orders WHERE id=$1 FOR UPDATE', [id], c);
      if (!o) throw notFound();
      const last = await one<{ status: string }>('SELECT status FROM quotes WHERE order_id=$1 ORDER BY version DESC LIMIT 1', [id], c);
      if (!['rejected', 'ready'].includes(o.status) || last?.status !== 'rejected') throw new AppError(409, 'order.bad_transition', { from: o.status, to: 'diagnosis' });
      const r = await q(`UPDATE order_lines SET approval='pending' WHERE order_id=$1 AND approval='rejected' RETURNING id`, [id], c);
      await q(`UPDATE orders SET status='diagnosis', updated_at=now() WHERE id=$1`, [id], c);
      await q(
        `INSERT INTO order_status_history (order_id, from_status, to_status, user_id, actor, note, created_at) VALUES ($1,$2,'diagnosis',$3,'staff','requote', clock_timestamp())`,
        [id, o.status, req.user!.id],
        c,
      );
      await audit(req, 'order.requote', 'order', id, { status: o.status }, { lines: r.length }, c);
      return { ok: true, lines: r.length };
    });
  });

  app.get('/quotes/:id/pdf', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const { lang } = parse(z.object({ lang: z.enum(['fr', 'en', 'es']).optional() }), req.query);
    const { buf, name } = await quotePdf(id, lang);
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="evaluation-${name}.pdf"`);
    return reply.send(buf);
  });
}
