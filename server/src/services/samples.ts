import { type Db, one, pool, q, tx } from '../db.js';
import { normalizePhone } from '../lib/phone.js';
import { SAMPLE_CLIENTS, STARTER_INVENTORY } from '../lib/sampleData.js';
import { moveStock } from './inventory.js';

/** Crea los clientes de ejemplo con su vehículo. Devuelve cuántos creó (0 si ya existían). */
export async function createSampleClients(c: Db) {
  const has = await one<{ n: number }>('SELECT count(*)::int AS n FROM clients WHERE is_sample', [], c);
  if (has!.n > 0) return 0;
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
}

/** Agrega los artículos del inventario básico que falten. Devuelve cuántos agregó. */
export async function addStarterInventory(c: Db, userId: string | null) {
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
    if (s.qty > 0) await moveStock(c, it.id, s.qty, 'initial', { unitCostCents: Math.round(s.cost * 100), userId, note: 'starter' });
    n++;
  }
  return n;
}

const SEED = 'samples-v1';
const REVIEW_SEED = 'review-url-v1';
/** Perfil de Google del taller (identificador /g/11zkrm26jd, sacado del enlace que dio el dueño). */
export const SHOP_GOOGLE_PROFILE = 'https://www.google.com/search?kgmid=/g/11zkrm26jd';

/**
 * Carga inicial en la instalación de prueba (DEMO_MODE): una sola vez, cuando el dueño ya creó su cuenta,
 * agrega los clientes de ejemplo y el inventario básico.
 */
export async function runStartupSeeds() {
  // Enlace de reseñas: se pone una sola vez y solo si el dueño no puso otro.
  const r = await one<{ seeds_done: string[] }>('SELECT seeds_done FROM settings WHERE id=1', [], pool);
  if (r && !r.seeds_done.includes(REVIEW_SEED)) {
    await q(
      `UPDATE settings SET google_review_url = CASE WHEN google_review_url='' THEN $1 ELSE google_review_url END,
              seeds_done = array_append(seeds_done, $2) WHERE id=1`,
      [SHOP_GOOGLE_PROFILE, REVIEW_SEED],
      pool,
    );
  }
  const s = await one<{ seeds_done: string[] }>('SELECT seeds_done FROM settings WHERE id=1', [], pool);
  if (!s || s.seeds_done.includes(SEED)) return null;
  const users = await one<{ n: number }>('SELECT count(*)::int AS n FROM users', [], pool);
  if (!users || users.n === 0) return null;
  return tx(async (c) => {
    const owner = await one<{ id: string }>(`SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1`, [], c);
    const clients = await createSampleClients(c);
    const items = await addStarterInventory(c, owner?.id ?? null);
    await q(`UPDATE settings SET seeds_done = array_append(seeds_done, $1) WHERE id=1`, [SEED], c);
    return { clients, items };
  });
}
