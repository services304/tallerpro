import pg from 'pg';
import { config } from './config.js';

// numeric → number (cantidades con 2 decimales; seguro en este rango)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// date → 'YYYY-MM-DD' (sin convertir a medianoche local, que cambia el día según la zona)
pg.types.setTypeParser(1082, (v) => v);
// bigint → number (números de factura, contadores)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

export type Db = pg.Pool | pg.PoolClient;

export let pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export function setPool(p: pg.Pool) {
  pool = p;
}

export async function q<T = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query(sql, params as any[]);
  return r.rows as T[];
}

export async function one<T = any>(sql: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const rows = await q<T>(sql, params, db);
  return rows[0] ?? null;
}

/** Ejecuta fn en una transacción. Todo o nada. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
