import { type Db, one, q } from '../db.js';
import { notFound } from '../lib/errors.js';

export type MoveKind = 'initial' | 'purchase' | 'use' | 'return' | 'adjust' | 'count';

/**
 * Mueve existencias de un artículo y deja el movimiento registrado.
 * Una compra recalcula el costo promedio. La existencia puede quedar negativa (se avisa en la app).
 */
export async function moveStock(
  db: Db,
  itemId: string,
  delta: number,
  kind: MoveKind,
  o: { unitCostCents?: number | null; orderId?: string | null; lineId?: string | null; supplierId?: string | null; note?: string; userId?: string | null } = {},
) {
  const it = await one<{ quantity: string; cost_cents: number }>('SELECT quantity, cost_cents FROM inventory_items WHERE id=$1 FOR UPDATE', [itemId], db);
  if (!it) throw notFound();
  const before = Number(it.quantity);
  const after = Math.round((before + delta) * 100) / 100;
  let cost = it.cost_cents;
  if ((kind === 'purchase' || kind === 'initial') && delta > 0 && o.unitCostCents != null) {
    // Costo promedio ponderado (lo que ya había, a su costo, más lo que entra).
    const base = Math.max(before, 0);
    cost = base + delta > 0 ? Math.round((base * it.cost_cents + delta * o.unitCostCents) / (base + delta)) : o.unitCostCents;
  }
  await q('UPDATE inventory_items SET quantity=$2, cost_cents=$3, updated_at=now() WHERE id=$1', [itemId, after, cost], db);
  return one(
    `INSERT INTO inventory_movements (item_id, kind, quantity, unit_cost_cents, balance, order_id, order_line_id, supplier_id, note, user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [itemId, kind, delta, o.unitCostCents ?? cost, after, o.orderId ?? null, o.lineId ?? null, o.supplierId ?? null, o.note ?? '', o.userId ?? null],
    db,
  );
}

/** Descuenta del inventario las piezas aprobadas de la orden (una sola vez por línea). */
export async function takeStockForOrder(db: Db, orderId: string, userId: string | null = null) {
  const lines = await q<{ id: string; inventory_item_id: string; quantity: string }>(
    `SELECT id, inventory_item_id, quantity FROM order_lines
      WHERE order_id=$1 AND approval='approved' AND inventory_item_id IS NOT NULL AND NOT stock_taken FOR UPDATE`,
    [orderId],
    db,
  );
  for (const l of lines) {
    await moveStock(db, l.inventory_item_id, -Number(l.quantity), 'use', { orderId, lineId: l.id, userId });
    await q('UPDATE order_lines SET stock_taken=true WHERE id=$1', [l.id], db);
  }
  return lines.length;
}

/** Devuelve al inventario lo que se había descontado (orden cancelada). */
export async function returnStockForOrder(db: Db, orderId: string, userId: string | null = null, note = '') {
  const lines = await q<{ id: string; inventory_item_id: string; quantity: string }>(
    `SELECT id, inventory_item_id, quantity FROM order_lines WHERE order_id=$1 AND stock_taken AND inventory_item_id IS NOT NULL FOR UPDATE`,
    [orderId],
    db,
  );
  for (const l of lines) {
    await moveStock(db, l.inventory_item_id, Number(l.quantity), 'return', { orderId, lineId: l.id, userId, note });
    await q('UPDATE order_lines SET stock_taken=false WHERE id=$1', [l.id], db);
  }
  return lines.length;
}
