import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { pool } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Aplica en orden las migraciones .sql que falten. Cada una en su propia transacción. */
export async function migrate(p: pg.Pool = pool, log = console.log): Promise<string[]> {
  await p.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await p.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(path.join(dir, f), 'utf8');
    const c = await p.connect();
    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
      await c.query('COMMIT');
      applied.push(f);
      log(`migración aplicada: ${f}`);
    } catch (e) {
      await c.query('ROLLBACK');
      throw new Error(`La migración ${f} falló: ${(e as Error).message}`);
    } finally {
      c.release();
    }
  }
  return applied;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  migrate()
    .then((a) => {
      console.log(a.length ? `${a.length} migración(es) aplicada(s)` : 'La base de datos ya está al día');
      return pool.end();
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
