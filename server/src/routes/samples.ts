import type { FastifyInstance } from 'fastify';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import { STARTER_INVENTORY } from '../lib/sampleData.js';
import { addStarterInventory, createSampleClients } from '../services/samples.js';
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
      const n = await createSampleClients(c);
      if (!n) throw new AppError(409, 'samples.exist');
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
    const added = await tx((c) => addStarterInventory(c, req.user!.id));
    return { added };
  });
}
