import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, pool, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { docLabels, type Lang } from '../lib/i18n.js';
import { computeTotals } from '../lib/money.js';
import { portalLink } from '../lib/notify.js';
import { EDITABLE_LINE_STATUSES, isManualAllowed, manualTargets, OPEN_STATUSES, type OrderStatus, ORDER_STATUSES, STATUS_EVENTS } from '../lib/orderStates.js';
import { approvedTotals, getSettings, maybeClose, moneyFor, nextOrderNumber, notifyOrder, transition } from '../services/orders.js';

const uuid = z.string().uuid();

const lineInput = z.object({
  kind: z.enum(['labor', 'part', 'fee', 'discount']),
  description: z.string().trim().min(1).max(300),
  work_type_id: uuid.nullable().optional(),
  quantity: z.number().positive().max(10_000).default(1),
  unit_price_cents: z.number().int().min(0).max(100_000_000).optional(),
  unit_cost_cents: z.number().int().min(0).max(100_000_000).default(0),
  part_condition: z.enum(['new', 'used', 'rebuilt']).nullable().optional(),
  inventory_item_id: uuid.nullable().optional(),
});

async function assertEditable(orderId: string) {
  const o = await one<{ status: OrderStatus }>('SELECT status FROM orders WHERE id=$1', [orderId]);
  if (!o) throw notFound();
  if (!EDITABLE_LINE_STATUSES.includes(o.status)) throw new AppError(409, 'order.not_editable', { status: o.status });
  return o;
}

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  app.get('/orders', async (req) => {
    const b = parse(
      z.object({ status: z.enum(ORDER_STATUSES).optional(), open: z.enum(['1', '0']).optional(), q: z.string().max(100).optional() }),
      req.query,
    );
    const like = b.q ? `%${b.q.toLowerCase()}%` : null;
    return q(
      `SELECT o.id, o.number, o.status, o.reason, o.priority, o.promised_at, o.created_at, o.updated_at, o.service_address,
              c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
              v.make, v.model, v.year, v.plate,
              (SELECT COALESCE(sum(round(quantity*unit_price_cents) * CASE WHEN kind='discount' THEN -1 ELSE 1 END),0)::int
                 FROM order_lines l WHERE l.order_id=o.id AND l.approval<>'rejected') AS lines_subtotal_cents,
              (SELECT min(scheduled_start) FROM visits vi WHERE vi.order_id=o.id AND vi.status IN ('scheduled','on_the_way') AND vi.scheduled_start > now() - interval '12 hours') AS next_visit
         FROM orders o JOIN clients c ON c.id=o.client_id JOIN vehicles v ON v.id=o.vehicle_id
        WHERE ($1::text IS NULL OR o.status=$1)
          AND ($2::text IS NULL OR ($2='1' AND o.status = ANY($4)) OR ($2='0' AND NOT (o.status = ANY($4))))
          AND ($3::text IS NULL OR lower(o.number) LIKE $3 OR lower(c.name) LIKE $3 OR lower(coalesce(v.plate,'')) LIKE $3)
        ORDER BY CASE o.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, o.promised_at NULLS LAST, o.created_at DESC
        LIMIT 300`,
      [b.status ?? null, b.open ?? null, like, OPEN_STATUSES],
    );
  });

  /** Recepción del vehículo en casa del cliente: crea la orden con el cargo de visita ya aprobado. */
  app.post('/orders', async (req) => {
    const b = parse(
      z.object({
        client_id: uuid,
        vehicle_id: uuid,
        visit_id: uuid.nullable().optional(),
        odometer_in: z.number().int().min(0).max(3_000_000).nullable().optional(),
        fuel_level: z.number().int().min(0).max(8).nullable().optional(),
        reason: z.string().trim().max(4000).default(''),
        service_address: z.string().trim().max(400).default(''),
        promised_at: z.string().datetime({ offset: true }).nullable().optional(),
        priority: z.enum(['low', 'normal', 'high']).default('normal'),
        return_parts: z.boolean().default(false),
        waive_estimate: z.boolean().default(false),
        contact_first: z.boolean().default(true),
        items_left: z.string().max(1000).default(''),
        damages: z.array(z.object({ zone: z.string().max(40), type: z.string().max(60), note: z.string().max(200).default('') })).max(40).default([]),
        consent_maintenance: z.boolean().optional(),
      }),
      req.body,
    );
    const userId = req.user!.id;
    const order = await tx(async (c) => {
      const owner = await one<{ lang: Lang; address: string }>(
        `SELECT c.lang, c.address FROM clients c JOIN vehicle_owners vo ON vo.client_id=c.id
          WHERE c.id=$1 AND vo.vehicle_id=$2 AND vo.until IS NULL`,
        [b.client_id, b.vehicle_id],
        c,
      );
      if (!owner) throw new AppError(400, 'validation.failed', { fields: 'vehicle_id' });
      const visit = b.visit_id ? await one<{ visit_fee_cents: number; address: string; order_id: string | null }>('SELECT visit_fee_cents, address, order_id FROM visits WHERE id=$1 FOR UPDATE', [b.visit_id], c) : null;
      if (b.visit_id && !visit) throw notFound();
      const s = await getSettings(c);
      const number = await nextOrderNumber(c);
      const damagesText = b.damages.map((d) => `• ${d.zone}: ${d.type}${d.note ? ` (${d.note})` : ''}`).join('\n');
      const o = await one<{ id: string; number: string }>(
        `INSERT INTO orders (number, client_id, vehicle_id, odometer_in, fuel_level, reason, service_address, promised_at, priority,
                             return_parts, waive_estimate, contact_first, items_left, diagnosis, assigned_user_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id, number`,
        [
          number, b.client_id, b.vehicle_id, b.odometer_in ?? null, b.fuel_level ?? null, b.reason,
          b.service_address || visit?.address || owner.address, b.promised_at ?? null, b.priority,
          b.return_parts, b.waive_estimate, b.contact_first, b.items_left,
          damagesText ? `${{ fr: 'Dommages à la réception', en: 'Damage at intake', es: 'Daños en la recepción' }[req.lang]}:\n${damagesText}` : '',
          userId,
        ],
        c,
      );
      await q(`INSERT INTO order_status_history (order_id, to_status, user_id, actor) VALUES ($1,'received',$2,'staff')`, [o!.id, userId], c);
      // Cargo de visita y diagnóstico: informado al agendar y firmado al llegar → ya aprobado.
      const fee = visit ? visit.visit_fee_cents : s.visit_fee_cents;
      if (fee > 0) {
        await q(
          `INSERT INTO order_lines (order_id, kind, description, quantity, unit_price_cents, approval, position)
           VALUES ($1,'fee',$2,1,$3,'approved',0)`,
          [o!.id, docLabels[owner.lang].visitFee, fee],
          c,
        );
      }
      if (b.visit_id) await q(`UPDATE visits SET order_id=$2, status='in_progress', vehicle_id=COALESCE(vehicle_id,$3) WHERE id=$1`, [b.visit_id, o!.id, b.vehicle_id], c);
      if (b.odometer_in) await q('UPDATE vehicles SET last_odometer=GREATEST(COALESCE(last_odometer,0),$2) WHERE id=$1', [b.vehicle_id, b.odometer_in], c);
      if (b.consent_maintenance !== undefined) {
        await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,'maintenance',$2,'intake')`, [b.client_id, b.consent_maintenance], c);
      }
      return o!;
    });
    return order;
  });

  app.get('/orders/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const order = await one<any>('SELECT * FROM orders WHERE id=$1', [id]);
    if (!order) throw notFound();
    const s = await getSettings(pool);
    const [client, vehicle, lines, history, photos, signatures, parts, offers, quotes, quoteLines, invoices, payments, visits, messages, timers] = await Promise.all([
      one('SELECT id, name, phone, email, address, lang, channels FROM clients WHERE id=$1', [order.client_id]),
      one('SELECT * FROM vehicles WHERE id=$1', [order.vehicle_id]),
      q('SELECT * FROM order_lines WHERE order_id=$1 ORDER BY position, created_at', [id]),
      q(`SELECT h.*, u.name AS user_name FROM order_status_history h LEFT JOIN users u ON u.id=h.user_id WHERE order_id=$1 ORDER BY created_at`, [id]),
      q('SELECT id, stage, kind, caption, damage_zone, mime, size_bytes, shared, created_at FROM photos WHERE order_id=$1 ORDER BY created_at', [id]),
      q('SELECT id, kind, signer_name, created_at FROM signatures WHERE order_id=$1 ORDER BY created_at', [id]),
      q('SELECT * FROM parts_requests WHERE order_id=$1 ORDER BY created_at', [id]),
      q(
        `SELECT so.*, su.name AS supplier_name FROM supplier_offers so JOIN suppliers su ON su.id=so.supplier_id
          WHERE so.request_id IN (SELECT id FROM parts_requests WHERE order_id=$1) ORDER BY so.unit_cost_cents`,
        [id],
      ),
      q('SELECT * FROM quotes WHERE order_id=$1 ORDER BY version DESC', [id]),
      q('SELECT ql.* FROM quote_lines ql JOIN quotes qt ON qt.id=ql.quote_id WHERE qt.order_id=$1 ORDER BY ql.position', [id]),
      q('SELECT * FROM invoices WHERE order_id=$1 ORDER BY issued_at DESC', [id]),
      q('SELECT p.* FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.order_id=$1 ORDER BY paid_at', [id]),
      q('SELECT * FROM visits WHERE order_id=$1 ORDER BY scheduled_start', [id]),
      q('SELECT * FROM client_messages WHERE order_id=$1 ORDER BY created_at', [id]),
      q(`SELECT t.*, u.name AS user_name FROM time_entries t JOIN users u ON u.id=t.user_id WHERE order_id=$1 ORDER BY started_at`, [id]),
    ]);
    const pending = lines.filter((l) => l.approval === 'pending');
    return {
      order,
      client,
      vehicle,
      lines,
      totals: {
        approved: computeTotals(lines.filter((l) => l.approval === 'approved'), s.taxes_registered),
        pending: computeTotals(pending, s.taxes_registered),
      },
      history,
      photos,
      signatures,
      parts: parts.map((p) => ({ ...p, offers: offers.filter((o) => o.request_id === p.id) })),
      quotes: quotes.map((qt) => ({ ...qt, lines: quoteLines.filter((l) => l.quote_id === qt.id) })),
      invoices,
      payments,
      visits,
      messages,
      timers,
      allowed: manualTargets(order.status),
      settings: { taxes_registered: s.taxes_registered, parts_margin_bp: s.parts_margin_bp, labor_rate_cents: s.labor_rate_cents },
    };
  });

  app.patch('/orders/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        reason: z.string().trim().max(4000),
        diagnosis: z.string().trim().max(8000),
        service_address: z.string().trim().max(400),
        promised_at: z.string().datetime({ offset: true }).nullable(),
        priority: z.enum(['low', 'normal', 'high']),
        return_parts: z.boolean(),
        items_left: z.string().max(1000),
        odometer_in: z.number().int().min(0).max(3_000_000).nullable(),
      }).partial(),
      req.body,
    );
    const cur = await one<any>('SELECT * FROM orders WHERE id=$1', [id]);
    if (!cur) throw notFound();
    const m = { ...cur, ...b };
    await q(
      `UPDATE orders SET reason=$2, diagnosis=$3, service_address=$4, promised_at=$5, priority=$6, return_parts=$7, items_left=$8, odometer_in=$9, updated_at=now() WHERE id=$1`,
      [id, m.reason, m.diagnosis, m.service_address, m.promised_at, m.priority, m.return_parts, m.items_left, m.odometer_in],
    );
    return { ok: true };
  });

  /** Cambio manual de estado (los estados de cotización y cierre tienen su propio flujo). */
  app.post('/orders/:id/status', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ to: z.enum(ORDER_STATUSES), note: z.string().max(1000).default(''), notify: z.boolean().default(true) }), req.body);
    return tx(async (c) => {
      const o = await one<{ status: OrderStatus; client_id: string }>('SELECT status, client_id FROM orders WHERE id=$1 FOR UPDATE', [id], c);
      if (!o) throw notFound();
      if (!isManualAllowed(o.status, b.to)) throw new AppError(409, 'order.bad_transition', { from: o.status, to: b.to });
      if (b.to === 'diagnosis' || b.to === 'cancelled') {
        // Recepción sin firma: solo se permite si es una cancelación.
        const sig = await one(`SELECT 1 FROM signatures WHERE order_id=$1 AND kind='intake'`, [id], c);
        if (!sig && b.to === 'diagnosis') throw new AppError(409, 'order.need_intake_signature');
      }
      await transition(c, id, b.to, { kind: 'staff', userId: req.user!.id }, b.note);
      const event = STATUS_EVENTS[b.to];
      if (b.notify && event) {
        const lang = (await one<{ lang: Lang }>('SELECT lang FROM clients WHERE id=$1', [o.client_id], c))!.lang;
        const inv = await one<{ total_cents: number; paid_cents: number }>(`SELECT total_cents, paid_cents FROM invoices WHERE order_id=$1 AND status<>'void' ORDER BY issued_at DESC LIMIT 1`, [id], c);
        const total = inv ? inv.total_cents - inv.paid_cents : (await approvedTotals(c, id)).total_cents;
        await notifyOrder(c, id, event as any, { total: moneyFor(lang, total) });
      }
      if (b.to === 'delivered') await maybeClose(c, id);
      if (b.to === 'cancelled') await audit(req, 'order.cancel', 'order', id, { status: o.status }, null, c);
      const now = await one<{ status: string }>('SELECT status FROM orders WHERE id=$1', [id], c);
      return { status: now!.status };
    });
  });

  // ---------- Líneas de trabajo ----------
  app.post('/orders/:id/lines', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(lineInput, req.body);
    await assertEditable(id);
    let price = b.unit_price_cents;
    let cost = b.unit_cost_cents;
    if (b.inventory_item_id) {
      // Pieza del inventario: precio y costo del artículo (el precio se puede cambiar).
      const it = await one<{ price_cents: number; cost_cents: number }>('SELECT price_cents, cost_cents FROM inventory_items WHERE id=$1', [b.inventory_item_id]);
      if (!it) throw new AppError(400, 'validation.failed', { fields: 'inventory_item_id' });
      price ??= it.price_cents;
      if (!cost) cost = it.cost_cents;
    }
    if (price === undefined && b.work_type_id) {
      const wt = await one<{ price_cents: number }>('SELECT price_cents FROM work_types WHERE id=$1', [b.work_type_id]);
      if (!wt) throw new AppError(400, 'validation.failed', { fields: 'work_type_id' });
      price = wt.price_cents;
    }
    if (price === undefined) {
      const s = await getSettings(pool);
      if (b.kind !== 'labor') throw new AppError(400, 'validation.failed', { fields: 'unit_price_cents' });
      price = s.labor_rate_cents;
    }
    const pos = await one<{ p: number }>('SELECT COALESCE(max(position),0)+1 AS p FROM order_lines WHERE order_id=$1', [id]);
    return one(
      `INSERT INTO order_lines (order_id, kind, description, work_type_id, quantity, unit_price_cents, unit_cost_cents, part_condition, position, inventory_item_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, b.kind, b.description, b.work_type_id ?? null, b.quantity, price, cost, b.kind === 'part' ? b.part_condition ?? 'new' : null, pos!.p,
        b.kind === 'part' ? b.inventory_item_id ?? null : null],
    );
  });

  /**
   * Enlace para que el cliente vea su vehículo (estado, fotos, aprobaciones) cuando el dueño quiera mandarlo.
   * Devuelve también un mensaje listo para WhatsApp/SMS en el idioma del cliente.
   */
  app.post('/orders/:id/portal-link', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const o = await one<{ client_id: string; number: string; name: string; phone: string | null; email: string | null; lang: Lang; make: string; model: string; pending: number }>(
      `SELECT o.client_id, o.number, c.name, c.phone, c.email, c.lang, v.make, v.model,
              (SELECT count(*)::int FROM quotes qt WHERE qt.order_id=o.id AND qt.status='sent') AS pending
         FROM orders o JOIN clients c ON c.id=o.client_id JOIN vehicles v ON v.id=o.vehicle_id WHERE o.id=$1 AND c.anonymized_at IS NULL`,
      [id],
    );
    if (!o) throw notFound();
    const url = await portalLink(o.client_id, id);
    const first = o.name.split(' ')[0];
    const veh = [o.make, o.model].filter(Boolean).join(' ');
    const msg = {
      es: o.pending
        ? `Hola ${first}, tu cotización para el ${veh} (orden ${o.number}) está lista. Revísala y apruébala aquí: ${url}`
        : `Hola ${first}, aquí puedes ver en todo momento cómo va tu ${veh} (orden ${o.number}), con fotos: ${url}`,
      en: o.pending
        ? `Hi ${first}, your estimate for the ${veh} (order ${o.number}) is ready. Review and approve it here: ${url}`
        : `Hi ${first}, follow your ${veh} (order ${o.number}) anytime, with photos: ${url}`,
      fr: o.pending
        ? `Bonjour ${first}, votre évaluation pour le ${veh} (bon ${o.number}) est prête. Consultez-la et approuvez-la ici : ${url}`
        : `Bonjour ${first}, suivez votre ${veh} (bon ${o.number}) en tout temps, avec photos : ${url}`,
    }[o.lang];
    await audit(req, 'portal.link', 'order', id);
    return { url, message: msg, phone: o.phone, email: o.email, pending: o.pending };
  });

  app.patch('/orders/:id/lines/:lineId', async (req) => {
    const p = parse(z.object({ id: uuid, lineId: uuid }), req.params);
    const b = parse(lineInput.partial(), req.body);
    await assertEditable(p.id);
    const cur = await one<any>('SELECT * FROM order_lines WHERE id=$1 AND order_id=$2', [p.lineId, p.id]);
    if (!cur) throw notFound();
    if (cur.approval !== 'pending') throw new AppError(409, 'order.not_editable', { status: cur.approval });
    const m = { ...cur, ...b };
    if (b.unit_price_cents !== undefined && b.unit_price_cents !== cur.unit_price_cents) {
      await audit(req, 'price.change', 'order_line', p.lineId, { unit_price_cents: cur.unit_price_cents }, { unit_price_cents: b.unit_price_cents });
    }
    return one(
      `UPDATE order_lines SET kind=$3, description=$4, quantity=$5, unit_price_cents=$6, unit_cost_cents=$7, part_condition=$8 WHERE id=$1 AND order_id=$2 RETURNING *`,
      [p.lineId, p.id, m.kind, m.description, m.quantity, m.unit_price_cents, m.unit_cost_cents, m.kind === 'part' ? m.part_condition ?? 'new' : null],
    );
  });

  app.delete('/orders/:id/lines/:lineId', async (req) => {
    const p = parse(z.object({ id: uuid, lineId: uuid }), req.params);
    await assertEditable(p.id);
    const r = await one(`DELETE FROM order_lines WHERE id=$1 AND order_id=$2 AND approval='pending' RETURNING id`, [p.lineId, p.id]);
    if (!r) throw notFound();
    return { ok: true };
  });

  // ---------- Cronómetro de mano de obra ----------
  app.post('/orders/:id/timer', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ action: z.enum(['start', 'stop']), line_id: uuid.nullable().optional() }), req.body);
    const running = await one<{ id: string }>('SELECT id FROM time_entries WHERE user_id=$1 AND ended_at IS NULL', [req.user!.id]);
    if (b.action === 'start') {
      if (running) await q('UPDATE time_entries SET ended_at=now() WHERE id=$1', [running.id]);
      return one('INSERT INTO time_entries (order_id, line_id, user_id) VALUES ($1,$2,$3) RETURNING *', [id, b.line_id ?? null, req.user!.id]);
    }
    if (running) await q('UPDATE time_entries SET ended_at=now() WHERE id=$1', [running.id]);
    return { ok: true };
  });

  // ---------- Mensajes del cliente (bandeja de la orden) ----------
  app.get('/orders/:id/messages', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    return q('SELECT * FROM client_messages WHERE order_id=$1 ORDER BY created_at', [id]);
  });
}
