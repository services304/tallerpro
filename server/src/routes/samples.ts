import type { FastifyInstance } from 'fastify';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';
import { SAMPLE_CLIENTS, STARTER_INVENTORY } from '../lib/sampleData.js';
import { requireUser } from '../app.js';
import { moveStock } from '../services/inventory.js';

export async function sampleRoutes(app: FastifyInstance) {
  app.get('/samples/status', { preHandler: requireUser() }, async () => {
    const r = await one<{ clients: number; starter: number }>(
      `SELECT (SELECT count(*)::int FROM clients WHERE is_sample) AS clients,
              (SELECT count(*)::int FROM inventory_items WHERE starter_key IS NOT NULL) AS starter`,
    );
    return { ...r, starterTotal: STARTER_INVENTORY.length };
  });

  /** Crea los 8 clientes de ejemplo con su vehículo (una sola vez). */
  app.post('/samples/clients', { preHandler: requireUser('admin') }, async (req) => {
    const created = await tx(async (c) => {
      const has = await one<{ n: number }>('SELECT count(*)::int AS n FROM clients WHERE is_sample', [], c);
      if (has!.n > 0) throw new AppError(409, 'samples.exist');
      let n = 0;
      for (const s of SAMPLE_CLIENTS) {
        const cl = await one<{ id: string }>(
          `INSERT INTO clients (name, phone, email, address, lang, channels, notes_internal, is_sample) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
          [s.name, normalizePhone(s.phone), s.email, s.address, s.lang, s.channels, s.notes],
          c,
        );
        await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,'maintenance',true,'staff'), ($1,'promo',false,'staff')`, [cl!.id], c);
        const v = s.vehicle;
        const ve = await one<{ id: string }>(
          `INSERT INTO vehicles (vin, plate, make, model, year, engine, color, last_odometer, is_sample) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id`,
          [v.vin, v.plate, v.make, v.model, v.year, v.engine, v.color, v.odometer],
          c,
        );
        await q('INSERT INTO vehicle_owners (vehicle_id, client_id) VALUES ($1,$2)', [ve!.id, cl!.id], c);
        n++;
      }
      return n;
    });
    await audit(req, 'samples.create', 'client', null, null, { count: created });
    return { created };
  });

  /** Borra los clientes de ejemplo y todo lo que se hizo con ellos (órdenes, citas, facturas de prueba). */
  app.delete('/samples/clients', { preHandler: requireUser('admin') }, async (req) => {
    const removed = await tx(async (c) => {
      const ids = (await q<{ id: string }>('SELECT id FROM clients WHERE is_sample', [], c)).map((r) => r.id);
      if (!ids.length) return 0;
      // Lo que se haya sacado del inventario en órdenes de ejemplo vuelve a él.
      const lines = await q<{ id: string; inventory_item_id: string; quantity: number; order_id: string }>(
        `SELECT l.id, l.inventory_item_id, l.quantity, l.order_id FROM order_lines l JOIN orders o ON o.id=l.order_id
          WHERE o.client_id = ANY($1) AND l.stock_taken AND l.inventory_item_id IS NOT NULL`,
        [ids],
        c,
      );
      for (const l of lines) await moveStock(c, l.inventory_item_id, Number(l.quantity), 'return', { note: 'sample removed', userId: req.user!.id });
      const inv = `SELECT id FROM invoices WHERE client_id = ANY($1)`;
      await q(`DELETE FROM payments WHERE invoice_id IN (${inv})`, [ids], c);
      await q(`DELETE FROM credit_notes WHERE invoice_id IN (${inv})`, [ids], c);
      await q(`DELETE FROM invoices WHERE client_id = ANY($1)`, [ids], c);
      await q(`DELETE FROM visits WHERE client_id = ANY($1)`, [ids], c);
      await q(`UPDATE quotes SET signature_id=NULL WHERE order_id IN (SELECT id FROM orders WHERE client_id = ANY($1))`, [ids], c);
      await q(`DELETE FROM orders WHERE client_id = ANY($1)`, [ids], c);
      await q(`DELETE FROM clients WHERE id = ANY($1)`, [ids], c);
      await q(`DELETE FROM vehicles v WHERE v.is_sample AND NOT EXISTS (SELECT 1 FROM vehicle_owners o WHERE o.vehicle_id=v.id)`, [], c);
      return ids.length;
    });
    await audit(req, 'samples.delete', 'client', null, null, { count: removed });
    return { removed };
  });

  /** Agrega el inventario básico sugerido (lo que falte; no toca lo que el dueño ya cambió). */
  app.post('/inventory/starter', { preHandler: requireUser('admin') }, async (req) => {
    const added = await tx(async (c) => {
      let n = 0;
      for (const s of STARTER_INVENTORY) {
        const it = await one<{ id: string }>(
          `INSERT INTO inventory_items (name, part_number, category, unit, location, min_quantity, cost_cents, price_cents, notes, starter_key)
           VALUES ($1,$2,$3,$4,'van',$5,$6,$7,$8,$9)
           ON CONFLICT (starter_key) WHERE starter_key IS NOT NULL DO NOTHING RETURNING id`,
          [s.name, s.part_number ?? '', s.category, s.unit, s.min, Math.round(s.cost * 100), Math.round(s.price * 100), s.notes, s.key],
          c,
        );
        if (!it) continue;
        if (s.qty > 0) await moveStock(c, it.id, s.qty, 'initial', { unitCostCents: Math.round(s.cost * 100), userId: req.user!.id, note: 'starter' });
        n++;
      }
      return n;
    });
    return { added };
  });
}
