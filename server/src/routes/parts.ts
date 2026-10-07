import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, pool, q, tx } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import { priceWithMargin } from '../lib/money.js';
import { provider } from '../lib/notify.js';
import { getSettings } from '../services/orders.js';

const uuid = z.string().uuid();

/** Disponibilidad de una pieza en el proveedor (menú desplegable) y su plazo típico en días. */
export const AVAILABILITY = {
  in_stock: 0,
  next_day: 1,
  two_three_days: 3,
  on_order: 7,
  over_week: 14,
  unavailable: null,
} as const;
const availability = z.enum(Object.keys(AVAILABILITY) as [keyof typeof AVAILABILITY, ...(keyof typeof AVAILABILITY)[]]);

/** Mensaje para pedir precio a un proveedor (siempre en francés: proveedores de Quebec). */
function supplierMessage(shop: string, vehicle: string, vin: string | null, parts: { description: string; part_number: string; quantity: number }[]) {
  const list = parts.map((p) => `- ${p.quantity} × ${p.description}${p.part_number ? ` (${p.part_number})` : ''}`).join('\n');
  return `Bonjour, ici ${shop}. Pouvez-vous me donner le prix et le délai pour :\n${list}\nVéhicule : ${vehicle}${vin ? ` — NIV ${vin}` : ''}.\nPrécisez si la pièce est neuve, usagée ou reconditionnée. Merci!`;
}

export async function partsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  app.post('/orders/:id/parts', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({ description: z.string().trim().min(1).max(300), part_number: z.string().trim().max(80).default(''), quantity: z.number().positive().max(1000).default(1) }),
      req.body,
    );
    const o = await one('SELECT id FROM orders WHERE id=$1', [id]);
    if (!o) throw notFound();
    return one('INSERT INTO parts_requests (order_id, description, part_number, quantity) VALUES ($1,$2,$3,$4) RETURNING *', [id, b.description, b.part_number, b.quantity]);
  });

  app.patch('/parts/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        description: z.string().trim().min(1).max(300),
        part_number: z.string().trim().max(80),
        quantity: z.number().positive().max(1000),
        status: z.enum(['pending', 'quoted', 'chosen', 'ordered', 'received']),
      }).partial(),
      req.body,
    );
    const cur = await one<any>('SELECT * FROM parts_requests WHERE id=$1', [id]);
    if (!cur) throw notFound();
    const m = { ...cur, ...b };
    await q('UPDATE parts_requests SET description=$2, part_number=$3, quantity=$4, status=$5 WHERE id=$1', [id, m.description, m.part_number, m.quantity, m.status]);
    if (b.quantity !== undefined) await q(`UPDATE order_lines SET quantity=$2 WHERE parts_request_id=$1 AND approval='pending'`, [id, b.quantity]);
    return { ok: true };
  });

  app.delete('/parts/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    await tx(async (c) => {
      const line = await one<{ approval: string }>('SELECT approval FROM order_lines WHERE parts_request_id=$1', [id], c);
      if (line && line.approval !== 'pending') throw new AppError(409, 'order.not_editable', { status: line.approval });
      await q(`DELETE FROM order_lines WHERE parts_request_id=$1 AND approval='pending'`, [id], c);
      const r = await one('DELETE FROM parts_requests WHERE id=$1 RETURNING id', [id], c);
      if (!r) throw notFound();
    });
    return { ok: true };
  });

  /** Texto listo para pedir precio a un proveedor; opcionalmente lo envía por correo o SMS. */
  app.post('/orders/:id/parts/ask', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ supplier_id: uuid, channel: z.enum(['email', 'sms', 'none']).default('none'), part_ids: z.array(uuid).optional() }), req.body);
    const o = await one<{ make: string; model: string; year: number | null; vin: string | null }>(
      'SELECT v.make, v.model, v.year, v.vin FROM orders o JOIN vehicles v ON v.id=o.vehicle_id WHERE o.id=$1',
      [id],
    );
    if (!o) throw notFound();
    const sup = await one<{ name: string; phone: string | null; email: string | null }>('SELECT name, phone, email FROM suppliers WHERE id=$1', [b.supplier_id]);
    if (!sup) throw notFound();
    const parts = await q(
      `SELECT description, part_number, quantity FROM parts_requests WHERE order_id=$1 AND ($2::uuid[] IS NULL OR id = ANY($2)) ORDER BY created_at`,
      [id, b.part_ids ?? null],
    );
    const s = await getSettings(pool);
    const text = supplierMessage(s.shop_name, [o.make, o.model, o.year].filter(Boolean).join(' '), o.vin, parts);
    let sent = false;
    if (b.channel === 'email' && sup.email) {
      await provider.send('email', sup.email, `Demande de prix — ${s.shop_name}`, text);
      sent = true;
    } else if (b.channel === 'sms' && sup.phone) {
      await provider.send('sms', sup.phone, '', text);
      sent = true;
    }
    return { text, sent, supplier: sup };
  });

  /** Registra la respuesta de un proveedor (precio, plazo, condición). */
  app.post('/parts/:id/offers', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        supplier_id: uuid,
        unit_cost_cents: z.number().int().positive().max(100_000_000),
        availability: availability.default('in_stock'),
        lead_days: z.number().int().min(0).max(365).nullable().optional(),
        condition: z.enum(['new', 'used', 'rebuilt']).default('new'),
        channel: z.enum(['email', 'sms', 'phone', 'other']).default('phone'),
        notes: z.string().max(1000).default(''),
      }),
      req.body,
    );
    const pr = await one('SELECT id FROM parts_requests WHERE id=$1', [id]);
    if (!pr) throw notFound();
    const offer = await one(
      `INSERT INTO supplier_offers (request_id, supplier_id, unit_cost_cents, availability, lead_days, condition, channel, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, b.supplier_id, b.unit_cost_cents, b.availability, b.lead_days ?? AVAILABILITY[b.availability], b.condition, b.channel, b.notes],
    );
    await q(`UPDATE parts_requests SET status='quoted' WHERE id=$1 AND status='pending'`, [id]);
    return offer;
  });

  app.delete('/offers/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await one<{ chosen: boolean }>('SELECT chosen FROM supplier_offers WHERE id=$1', [id]);
    if (!r) throw notFound();
    if (r.chosen) throw new AppError(409, 'order.not_editable', { status: 'chosen' });
    await q('DELETE FROM supplier_offers WHERE id=$1', [id]);
    return { ok: true };
  });

  /**
   * Elige la mejor oferta: crea (o actualiza) la línea de pieza de la orden con costo + margen.
   * La línea queda «pendiente» hasta que el cliente apruebe la cotización.
   */
  app.post('/offers/:id/choose', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ unit_price_cents: z.number().int().min(0).max(100_000_000).optional() }), req.body ?? {});
    return tx(async (c) => {
      const off = await one<any>(
        `SELECT so.*, pr.order_id, pr.description, pr.part_number, pr.quantity FROM supplier_offers so
           JOIN parts_requests pr ON pr.id=so.request_id WHERE so.id=$1 FOR UPDATE OF so`,
        [id],
        c,
      );
      if (!off) throw notFound();
      if (off.availability === 'unavailable') throw new AppError(409, 'parts.unavailable');
      const line = await one<{ id: string; approval: string }>('SELECT id, approval FROM order_lines WHERE parts_request_id=$1', [off.request_id], c);
      if (line && line.approval !== 'pending') throw new AppError(409, 'order.not_editable', { status: line.approval });
      await q('UPDATE supplier_offers SET chosen=false WHERE request_id=$1', [off.request_id], c);
      await q('UPDATE supplier_offers SET chosen=true WHERE id=$1', [id], c);
      await q(`UPDATE parts_requests SET status='chosen' WHERE id=$1`, [off.request_id], c);
      const s = await getSettings(c);
      const price = b.unit_price_cents ?? priceWithMargin(off.unit_cost_cents, s.parts_margin_bp);
      const desc = off.part_number ? `${off.description} (${off.part_number})` : off.description;
      if (line) {
        await q(
          `UPDATE order_lines SET description=$2, quantity=$3, unit_price_cents=$4, unit_cost_cents=$5, part_condition=$6 WHERE id=$1`,
          [line.id, desc, off.quantity, price, off.unit_cost_cents, off.condition],
          c,
        );
        return { line_id: line.id, unit_price_cents: price };
      }
      const pos = await one<{ p: number }>('SELECT COALESCE(max(position),0)+1 AS p FROM order_lines WHERE order_id=$1', [off.order_id], c);
      const l = await one<{ id: string }>(
        `INSERT INTO order_lines (order_id, kind, description, parts_request_id, quantity, unit_price_cents, unit_cost_cents, part_condition, position)
         VALUES ($1,'part',$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [off.order_id, desc, off.request_id, off.quantity, price, off.unit_cost_cents, off.condition, pos!.p],
        c,
      );
      return { line_id: l!.id, unit_price_cents: price };
    });
  });
}
