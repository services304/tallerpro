import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { moveStock } from '../services/inventory.js';

const uuid = z.string().uuid();
export const INVENTORY_CATEGORIES = ['fluids', 'filters', 'brakes', 'electrical', 'ignition', 'engine', 'suspension', 'tires', 'hardware', 'other'] as const;
export const INVENTORY_UNITS = ['unit', 'l', 'qt', 'kg', 'm', 'box', 'set'] as const;
const qty = z.number().min(-100_000).max(100_000);

const itemInput = z.object({
  name: z.string().trim().min(1).max(200),
  part_number: z.string().trim().max(80).default(''),
  category: z.enum(INVENTORY_CATEGORIES).default('other'),
  unit: z.enum(INVENTORY_UNITS).default('unit'),
  location: z.enum(['van', 'shop']).default('van'),
  min_quantity: z.number().min(0).max(100_000).default(0),
  cost_cents: z.number().int().min(0).max(100_000_000).default(0),
  price_cents: z.number().int().min(0).max(100_000_000).default(0),
  supplier_id: uuid.nullable().default(null),
  notes: z.string().max(2000).default(''),
  active: z.boolean().default(true),
});

const ITEM_SELECT = `SELECT i.*, s.name AS supplier_name,
       (SELECT COALESCE(sum(l.quantity),0) FROM order_lines l JOIN orders o ON o.id=l.order_id
         WHERE l.inventory_item_id=i.id AND l.approval='pending' AND o.status NOT IN ('cancelled','closed')) AS reserved
  FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id`;

export async function inventoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  app.get('/inventory', async (req) => {
    const b = parse(z.object({ q: z.string().max(100).optional(), low: z.enum(['1', '0']).optional(), all: z.enum(['1', '0']).optional() }), req.query);
    return q(
      `${ITEM_SELECT}
        WHERE ($1::text IS NULL OR i.name ILIKE '%'||$1||'%' OR i.part_number ILIKE '%'||$1||'%')
          AND ($2::boolean IS NOT TRUE OR (i.active AND i.quantity <= i.min_quantity))
          AND ($3::boolean IS TRUE OR i.active)
        ORDER BY i.active DESC, i.category, lower(i.name)`,
      [b.q?.trim() || null, b.low === '1', b.all === '1'],
    );
  });

  /** Resumen: valor del inventario (a costo) y artículos en stock bajo. */
  app.get('/inventory/summary', async () =>
    one(
      `SELECT count(*)::int AS items,
              COALESCE(sum(GREATEST(quantity,0) * cost_cents),0)::bigint AS value_cents,
              COALESCE(sum(GREATEST(quantity,0) * price_cents),0)::bigint AS retail_cents,
              count(*) FILTER (WHERE quantity <= min_quantity)::int AS low
         FROM inventory_items WHERE active`,
    ),
  );

  app.get('/inventory/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const item = await one(`${ITEM_SELECT} WHERE i.id=$1`, [id]);
    if (!item) throw notFound();
    const movements = await q(
      `SELECT m.*, o.number AS order_number, s.name AS supplier_name, u.name AS user_name
         FROM inventory_movements m LEFT JOIN orders o ON o.id=m.order_id LEFT JOIN suppliers s ON s.id=m.supplier_id LEFT JOIN users u ON u.id=m.user_id
        WHERE m.item_id=$1 ORDER BY m.created_at DESC LIMIT 200`,
      [id],
    );
    return { item, movements };
  });

  /** Artículo nuevo; si trae cantidad inicial, queda como primer movimiento. */
  app.post('/inventory', async (req) => {
    const b = parse(itemInput.extend({ quantity: z.number().min(0).max(100_000).default(0) }), req.body);
    return tx(async (c) => {
      const it = await one<{ id: string }>(
        `INSERT INTO inventory_items (name, part_number, category, unit, location, min_quantity, cost_cents, price_cents, supplier_id, notes, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [b.name, b.part_number, b.category, b.unit, b.location, b.min_quantity, b.cost_cents, b.price_cents, b.supplier_id, b.notes, b.active],
        c,
      );
      if (b.quantity > 0) await moveStock(c, it!.id, b.quantity, 'initial', { unitCostCents: b.cost_cents, supplierId: b.supplier_id, userId: req.user!.id });
      return one(`${ITEM_SELECT} WHERE i.id=$1`, [it!.id], c);
    });
  });

  /** Editar datos (la cantidad solo cambia con movimientos). */
  app.patch('/inventory/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(itemInput.partial(), req.body);
    const cur = await one<any>('SELECT * FROM inventory_items WHERE id=$1', [id]);
    if (!cur) throw notFound();
    const m = { ...cur, ...b };
    if (b.price_cents !== undefined && b.price_cents !== cur.price_cents) {
      await audit(req, 'inventory.price', 'inventory_item', id, { price_cents: cur.price_cents }, { price_cents: b.price_cents });
    }
    await q(
      `UPDATE inventory_items SET name=$2, part_number=$3, category=$4, unit=$5, location=$6, min_quantity=$7, cost_cents=$8, price_cents=$9,
              supplier_id=$10, notes=$11, active=$12, updated_at=now() WHERE id=$1`,
      [id, m.name, m.part_number, m.category, m.unit, m.location, m.min_quantity, m.cost_cents, m.price_cents, m.supplier_id, m.notes, m.active],
    );
    return one(`${ITEM_SELECT} WHERE i.id=$1`, [id]);
  });

  /**
   * Movimiento manual:
   *  - purchase: entra mercancía (cantidad positiva, con costo → recalcula costo promedio)
   *  - adjust: suma o resta (pérdida, dañado, uso fuera de una orden…), con motivo
   *  - count: conteo físico; se indica la cantidad real y se registra la diferencia
   */
  app.post('/inventory/:id/movements', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        kind: z.enum(['purchase', 'adjust', 'count']),
        quantity: qty,
        unit_cost_cents: z.number().int().min(0).max(100_000_000).optional(),
        supplier_id: uuid.nullable().optional(),
        note: z.string().max(500).default(''),
      }),
      req.body,
    );
    return tx(async (c) => {
      const it = await one<{ quantity: number }>('SELECT quantity FROM inventory_items WHERE id=$1', [id], c);
      if (!it) throw notFound();
      let delta = b.quantity;
      if (b.kind === 'purchase' && b.quantity <= 0) throw new AppError(400, 'validation.failed', { fields: 'quantity' });
      if (b.kind === 'adjust' && b.quantity === 0) throw new AppError(400, 'validation.failed', { fields: 'quantity' });
      if (b.kind === 'count') {
        if (b.quantity < 0) throw new AppError(400, 'validation.failed', { fields: 'quantity' });
        delta = Math.round((b.quantity - Number(it.quantity)) * 100) / 100;
      }
      const mv = await moveStock(c, id, delta, b.kind, {
        unitCostCents: b.kind === 'purchase' ? b.unit_cost_cents ?? null : null,
        supplierId: b.supplier_id ?? null,
        note: b.note,
        userId: req.user!.id,
      });
      const item = await one(`${ITEM_SELECT} WHERE i.id=$1`, [id], c);
      return { movement: mv, item };
    });
  });

  /** Exportar a CSV (contabilidad / QuickBooks / respaldo). */
  app.get('/inventory.csv', async (_req, reply) => {
    const rows = await q(`${ITEM_SELECT} WHERE i.active ORDER BY i.category, lower(i.name)`);
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['name', 'part_number', 'category', 'location', 'unit', 'quantity', 'min_quantity', 'unit_cost', 'unit_price', 'value_at_cost', 'supplier'];
    const lines = rows.map((r: any) =>
      [r.name, r.part_number, r.category, r.location, r.unit, r.quantity, r.min_quantity, (r.cost_cents / 100).toFixed(2), (r.price_cents / 100).toFixed(2),
        ((Math.max(r.quantity, 0) * r.cost_cents) / 100).toFixed(2), r.supplier_name ?? ''].map(esc).join(','),
    );
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="inventaire.csv"');
    return '﻿' + [head.join(','), ...lines].join('\n');
  });
}
