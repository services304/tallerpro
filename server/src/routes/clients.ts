import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';
import { csvSafe } from '../lib/security.js';
import { storage } from '../lib/storage.js';

const channel = z.enum(['sms', 'whatsapp', 'email']);

export const clientInput = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(400).default(''),
  lang: z.enum(['fr', 'en', 'es']).default('fr'),
  channels: z.array(channel).max(3).default(['sms']),
  notes_internal: z.string().max(4000).default(''),
});

function cleanPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const n = normalizePhone(p);
  if (!n) throw new AppError(400, 'validation.failed', { fields: 'phone' });
  return n;
}

/** Busca un cliente existente con el mismo teléfono o correo. */
export async function findDuplicate(phone: string | null, email: string | null, exceptId?: string) {
  if (!phone && !email) return null;
  return one<{ id: string; name: string }>(
    `SELECT id, name FROM clients
      WHERE anonymized_at IS NULL AND id IS DISTINCT FROM $3
        AND (($1::text IS NOT NULL AND phone = $1) OR ($2::text IS NOT NULL AND lower(email) = lower($2)))
      LIMIT 1`,
    [phone, email, exceptId ?? null],
  );
}

export async function clientRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  app.get('/clients', async (req) => {
    const { q: term = '' } = parse(z.object({ q: z.string().max(100).optional() }), req.query);
    const like = `%${term.trim().toLowerCase()}%`;
    const digits = term.replace(/\D/g, '');
    return q(
      `SELECT c.id, c.name, c.phone, c.email, c.lang, c.channels, c.address,
              (SELECT count(*)::int FROM vehicle_owners vo WHERE vo.client_id=c.id AND vo.until IS NULL) AS vehicles,
              (SELECT COALESCE(sum(total_cents - paid_cents),0)::int FROM invoices i WHERE i.client_id=c.id AND i.status IN ('issued','partial')) AS balance_cents,
              (SELECT max(created_at) FROM orders o WHERE o.client_id=c.id) AS last_order_at
         FROM clients c
        WHERE c.anonymized_at IS NULL AND (
              $1 = '%%' OR lower(c.name) LIKE $1 OR lower(coalesce(c.email,'')) LIKE $1
              OR ($2 <> '' AND c.phone LIKE '%' || $2 || '%')
              OR EXISTS (SELECT 1 FROM vehicle_owners vo JOIN vehicles v ON v.id=vo.vehicle_id
                          WHERE vo.client_id=c.id AND (lower(coalesce(v.plate,'')) LIKE $1 OR lower(coalesce(v.vin,'')) LIKE $1)))
        ORDER BY last_order_at DESC NULLS LAST, c.name
        LIMIT 100`,
      [like, digits],
    );
  });

  app.post('/clients', async (req) => {
    const b = parse(clientInput.extend({ force: z.boolean().default(false), consent_maintenance: z.boolean().default(false), consent_promo: z.boolean().default(false) }), req.body);
    const phone = cleanPhone(b.phone);
    const email = b.email ?? null;
    if (!b.force) {
      const dup = await findDuplicate(phone, email);
      if (dup) throw new AppError(409, 'client.duplicate', { name: dup.name });
    }
    const c = await tx(async (db) => {
      const c = await one<{ id: string }>(
        `INSERT INTO clients (name, phone, email, address, lang, channels, notes_internal) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [b.name, phone, email, b.address, b.lang, b.channels, b.notes_internal],
        db,
      );
      for (const [kind, granted] of [['maintenance', b.consent_maintenance], ['promo', b.consent_promo]] as const) {
        await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,$2,$3,'staff')`, [c!.id, kind, granted], db);
      }
      return c;
    });
    return c;
  });

  app.get('/clients/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const client = await one('SELECT * FROM clients WHERE id=$1', [id]);
    if (!client) throw notFound();
    const [vehicles, orders, invoices, consents, notifications, messages, visits] = await Promise.all([
      q(
        `SELECT v.*, vo.since FROM vehicles v JOIN vehicle_owners vo ON vo.vehicle_id=v.id
          WHERE vo.client_id=$1 AND vo.until IS NULL ORDER BY vo.since DESC`,
        [id],
      ),
      q(
        `SELECT o.id, o.number, o.status, o.reason, o.created_at, o.odometer_in, v.make, v.model, v.year, v.plate
           FROM orders o JOIN vehicles v ON v.id=o.vehicle_id WHERE o.client_id=$1 ORDER BY o.created_at DESC`,
        [id],
      ),
      q(`SELECT id, number, kind, total_cents, paid_cents, status, issued_at, order_id FROM invoices WHERE client_id=$1 ORDER BY issued_at DESC`, [id]),
      q(`SELECT DISTINCT ON (kind) kind, granted, source, created_at FROM consents WHERE client_id=$1 ORDER BY kind, created_at DESC`, [id]),
      q(`SELECT id, event, channel, status, to_address, created_at, sent_at, error FROM notifications WHERE client_id=$1 ORDER BY created_at DESC LIMIT 30`, [id]),
      q(`SELECT id, order_id, direction, channel, body, created_at FROM client_messages WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50`, [id]),
      q(`SELECT id, scheduled_start, scheduled_end, status, purpose, address FROM visits WHERE client_id=$1 ORDER BY scheduled_start DESC LIMIT 20`, [id]),
    ]);
    return { client, vehicles, orders, invoices, consents, notifications, messages, visits };
  });

  app.patch('/clients/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(clientInput.partial(), req.body);
    const before = await one('SELECT * FROM clients WHERE id=$1', [id]);
    if (!before) throw notFound();
    const phone = b.phone === undefined ? before.phone : cleanPhone(b.phone);
    const email = b.email === undefined ? before.email : b.email;
    const dup = await findDuplicate(phone, email, id);
    if (dup && (phone !== before.phone || email !== before.email)) throw new AppError(409, 'client.duplicate', { name: dup.name });
    await q(
      `UPDATE clients SET name=$2, phone=$3, email=$4, address=$5, lang=$6, channels=$7, notes_internal=$8, updated_at=now() WHERE id=$1`,
      [id, b.name ?? before.name, phone, email, b.address ?? before.address, b.lang ?? before.lang, b.channels ?? before.channels, b.notes_internal ?? before.notes_internal],
    );
    return { ok: true };
  });

  app.post('/clients/:id/consents', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(z.object({ kind: z.enum(['service', 'maintenance', 'promo']), granted: z.boolean() }), req.body);
    await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,$2,$3,'staff')`, [id, b.kind, b.granted]);
    return { ok: true };
  });

  /** Fusiona dos clientes duplicados: todo lo del origen pasa al destino. */
  app.post('/clients/:id/merge', { preHandler: requireUser('admin') }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { sourceId } = parse(z.object({ sourceId: z.string().uuid() }), req.body);
    if (id === sourceId) throw new AppError(400, 'validation.failed', { fields: 'sourceId' });
    await tx(async (c) => {
      const src = await one('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [sourceId], c);
      const dst = await one('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [id], c);
      if (!src || !dst) throw notFound();
      for (const tbl of ['vehicle_owners', 'orders', 'invoices', 'visits', 'consents', 'notifications', 'client_messages', 'client_tokens']) {
        await q(`UPDATE ${tbl} SET client_id=$1 WHERE client_id=$2`, [id, sourceId], c);
      }
      await q(
        `UPDATE clients SET phone=COALESCE(phone,$2), email=COALESCE(email,$3),
                address=CASE WHEN address='' THEN $4 ELSE address END,
                notes_internal=trim(notes_internal || E'\n' || $5), updated_at=now() WHERE id=$1`,
        [id, src.phone, src.email, src.address, src.notes_internal],
        c,
      );
      await q('DELETE FROM portal_codes WHERE client_id=$1', [sourceId], c);
      await q('DELETE FROM clients WHERE id=$1', [sourceId], c);
      await audit(req, 'client.merge', 'client', id, src, null, c);
    });
    return { ok: true };
  });

  /** Exportación de los datos de un cliente (Loi 25: derecho de acceso). */
  app.get('/clients/:id/export', async (req, reply) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const client = await one('SELECT * FROM clients WHERE id=$1', [id]);
    if (!client) throw notFound();
    const data = {
      exported_at: new Date().toISOString(),
      client,
      consents: await q('SELECT kind, granted, source, created_at FROM consents WHERE client_id=$1 ORDER BY created_at', [id]),
      vehicles: await q('SELECT v.* FROM vehicles v JOIN vehicle_owners vo ON vo.vehicle_id=v.id WHERE vo.client_id=$1', [id]),
      orders: await q('SELECT * FROM orders WHERE client_id=$1', [id]),
      quotes: await q('SELECT qt.* FROM quotes qt JOIN orders o ON o.id=qt.order_id WHERE o.client_id=$1', [id]),
      invoices: await q('SELECT * FROM invoices WHERE client_id=$1', [id]),
      payments: await q('SELECT p.* FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE i.client_id=$1', [id]),
      visits: await q('SELECT * FROM visits WHERE client_id=$1', [id]),
      messages: await q('SELECT * FROM client_messages WHERE client_id=$1', [id]),
      notifications: await q('SELECT event, channel, to_address, status, created_at FROM notifications WHERE client_id=$1', [id]),
    };
    await audit(req, 'client.export', 'client', id);
    reply.header('Content-Disposition', `attachment; filename="client-${id}.json"`);
    return data;
  });

  /**
   * Eliminación a pedido del cliente. Las facturas se conservan 6 años (obligación fiscal):
   * se borran contactos, notas, fotos y enlaces; el nombre solo se quita si no hay facturas.
   */
  app.post('/clients/:id/anonymize', { preHandler: requireUser('admin') }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const keys = await tx(async (c) => {
      const cl = await one('SELECT * FROM clients WHERE id=$1 FOR UPDATE', [id], c);
      if (!cl) throw notFound();
      const inv = await one<{ n: number }>('SELECT count(*)::int AS n FROM invoices WHERE client_id=$1', [id], c);
      const photos = await q<{ storage_key: string }>(
        `DELETE FROM photos WHERE order_id IN (SELECT id FROM orders WHERE client_id=$1) RETURNING storage_key`,
        [id],
        c,
      );
      await q('DELETE FROM client_tokens WHERE client_id=$1', [id], c);
      await q('DELETE FROM portal_codes WHERE client_id=$1', [id], c);
      await q('DELETE FROM client_messages WHERE client_id=$1', [id], c);
      await q(`UPDATE notifications SET to_address='—', body='—', subject='' WHERE client_id=$1`, [id], c);
      await q(
        `UPDATE clients SET phone=NULL, email=NULL, address='', notes_internal='', channels='{}',
                name=CASE WHEN $2 > 0 THEN name ELSE 'Client anonymisé' END, anonymized_at=now(), updated_at=now() WHERE id=$1`,
        [id, inv!.n],
        c,
      );
      await audit(req, 'client.anonymize', 'client', id, null, null, c);
      return photos.map((p) => p.storage_key);
    });
    await Promise.all(keys.map((k) => storage.del(k)));
    return { ok: true };
  });

  app.get('/clients-export.csv', { preHandler: requireUser('admin') }, async (_req, reply) => {
    const rows = await q('SELECT name, phone, email, address, lang, created_at FROM clients WHERE anonymized_at IS NULL ORDER BY name');
    const head = 'name,phone,email,address,lang,created_at';
    const body = rows.map((r) => [r.name, r.phone, r.email, r.address, r.lang, new Date(r.created_at).toISOString()].map(csvSafe).join(','));
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="clients.csv"');
    return '﻿' + [head, ...body].join('\r\n');
  });
}
