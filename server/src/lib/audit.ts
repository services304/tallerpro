import type { FastifyRequest } from 'fastify';
import { type Db, pool, q } from '../db.js';

/** Registro de auditoría de acciones sensibles (anular, cambiar precios, borrar, importar…). */
export async function audit(
  req: FastifyRequest | null,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown = null,
  after: unknown = null,
  db: Db = pool,
) {
  await q(
    `INSERT INTO audit_log (user_id, action, entity, entity_id, before, after, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req?.user?.id ?? null, action, entity, entityId, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, req?.ip ?? null],
    db,
  );
}
