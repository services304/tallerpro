import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { type Db, one, pool, q } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import type { Lang } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { enqueue } from '../lib/notify.js';
import { fmtDate, fmtTime } from '../lib/time.js';
import { coordsLabel } from '../lib/geocode.js';
import { getSettings } from '../services/orders.js';

const iso = z.string().datetime({ offset: true });

async function notifyVisit(db: Db, visitId: string, event: 'visit_scheduled' | 'visit_reminder' | 'on_the_way', etaMinutes?: number) {
  const v = await one<{ client_id: string; order_id: string | null; scheduled_start: Date; address: string; visit_fee_cents: number; lang: Lang }>(
    `SELECT v.client_id, v.order_id, v.scheduled_start, v.address, v.visit_fee_cents, c.lang
       FROM visits v JOIN clients c ON c.id=v.client_id WHERE v.id=$1`,
    [visitId],
    db,
  );
  if (!v) return 0;
  const start = new Date(v.scheduled_start);
  const eta = new Date(Date.now() + (etaMinutes ?? 0) * 60_000);
  return enqueue(
    {
      event,
      clientId: v.client_id,
      orderId: v.order_id,
      vars: {
        date: fmtDate(start, v.lang),
        time: fmtTime(start, v.lang),
        address: v.address,
        fee: formatMoney(v.visit_fee_cents, v.lang),
        eta: fmtTime(eta, v.lang),
      },
    },
    db,
  );
}

/** Recordatorio el día antes: visitas que empiezan entre 2 h y 30 h desde ahora y aún sin recordatorio. */
export async function sendVisitReminders(db: Db = pool): Promise<number> {
  const due = await q<{ id: string }>(
    `UPDATE visits SET reminder_sent_at = now()
      WHERE status='scheduled' AND reminder_sent_at IS NULL
        AND scheduled_start BETWEEN now() + interval '2 hours' AND now() + interval '30 hours'
        AND created_at < now() - interval '1 hour'
      RETURNING id`,
    [],
    db,
  );
  for (const v of due) await notifyVisit(db, v.id, 'visit_reminder');
  return due.length;
}

export async function visitRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  app.get('/visits', async (req) => {
    const b = parse(z.object({ from: iso.optional(), to: iso.optional() }), req.query);
    const from = b.from ?? new Date(Date.now() - 24 * 3600_000).toISOString();
    const to = b.to ?? new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
    return q(
      `SELECT v.*, c.name AS client_name, c.phone AS client_phone, ve.make, ve.model, ve.year, ve.plate, o.number AS order_number, o.status AS order_status
         FROM visits v JOIN clients c ON c.id=v.client_id
         LEFT JOIN vehicles ve ON ve.id=v.vehicle_id LEFT JOIN orders o ON o.id=v.order_id
        WHERE v.scheduled_start >= $1 AND v.scheduled_start < $2
        ORDER BY v.scheduled_start`,
      [from, to],
    );
  });

  app.post('/visits', async (req) => {
    const b = parse(
      z.object({
        client_id: z.string().uuid(),
        vehicle_id: z.string().uuid().nullable().optional(),
        order_id: z.string().uuid().nullable().optional(),
        purpose: z.enum(['diagnosis', 'repair', 'other']).default('diagnosis'),
        address: z.string().trim().max(400).optional(),
        scheduled_start: iso,
        duration_minutes: z.number().int().min(15).max(24 * 60).default(90),
        visit_fee_cents: z.number().int().min(0).max(10_000_000).optional(),
        notes: z.string().max(2000).default(''),
        notify: z.boolean().default(true),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
      }),
      req.body,
    );
    const client = await one<{ address: string }>('SELECT address FROM clients WHERE id=$1 AND anonymized_at IS NULL', [b.client_id]);
    if (!client) throw notFound();
    const address = b.address || client.address || (b.lat != null && b.lng != null ? coordsLabel(b.lat, b.lng) : '');
    if (!address) throw new AppError(400, 'validation.failed', { fields: 'address' });
    const s = await getSettings(pool);
    // Una visita de reparación (segunda visita) no cobra otra vez el desplazamiento, salvo que se indique.
    const fee = b.visit_fee_cents ?? (b.purpose === 'diagnosis' ? s.visit_fee_cents : 0);
    const start = new Date(b.scheduled_start);
    const end = new Date(start.getTime() + b.duration_minutes * 60_000);
    const v = await one<{ id: string }>(
      `INSERT INTO visits (client_id, vehicle_id, order_id, purpose, address, scheduled_start, scheduled_end, visit_fee_cents, notes, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [b.client_id, b.vehicle_id ?? null, b.order_id ?? null, b.purpose, address, start, end, fee, b.notes, b.lat ?? null, b.lng ?? null],
    );
    if (b.lat != null && b.lng != null) await q('UPDATE clients SET lat=$2, lng=$3 WHERE id=$1', [b.client_id, b.lat, b.lng]);
    if (!client.address) await q('UPDATE clients SET address=$2 WHERE id=$1', [b.client_id, address]);
    if (b.notify) await notifyVisit(pool, v!.id, 'visit_scheduled');
    return v;
  });

  app.patch('/visits/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(
      z.object({
        scheduled_start: iso.optional(),
        duration_minutes: z.number().int().min(15).max(24 * 60).optional(),
        address: z.string().trim().min(1).max(400).optional(),
        status: z.enum(['requested', 'scheduled', 'in_progress', 'done', 'cancelled']).optional(),
        vehicle_id: z.string().uuid().nullable().optional(),
        visit_fee_cents: z.number().int().min(0).max(10_000_000).optional(),
        notes: z.string().max(2000).optional(),
        notify: z.boolean().default(true),
      }),
      req.body,
    );
    const cur = await one('SELECT * FROM visits WHERE id=$1', [id]);
    if (!cur) throw notFound();
    const start = b.scheduled_start ? new Date(b.scheduled_start) : new Date(cur.scheduled_start);
    const dur = b.duration_minutes ?? Math.round((new Date(cur.scheduled_end).getTime() - new Date(cur.scheduled_start).getTime()) / 60_000);
    const end = new Date(start.getTime() + dur * 60_000);
    const moved = start.getTime() !== new Date(cur.scheduled_start).getTime();
    await q(
      `UPDATE visits SET scheduled_start=$2, scheduled_end=$3, address=$4, status=$5, vehicle_id=$6, visit_fee_cents=$7, notes=$8,
              reminder_sent_at = CASE WHEN $9 THEN NULL ELSE reminder_sent_at END WHERE id=$1`,
      [
        id, start, end, b.address ?? cur.address, b.status ?? cur.status,
        b.vehicle_id === undefined ? cur.vehicle_id : b.vehicle_id, b.visit_fee_cents ?? cur.visit_fee_cents, b.notes ?? cur.notes, moved,
      ],
    );
    if (moved && b.notify) await notifyVisit(pool, id, 'visit_scheduled');
    return { ok: true };
  });

  /** Confirmar una cita pedida en línea: pasa a la agenda y se le avisa al cliente. */
  app.post('/visits/:id/confirm', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const r = await one(`UPDATE visits SET status='scheduled' WHERE id=$1 AND status='requested' RETURNING id`, [id]);
    if (!r) throw new AppError(409, 'validation.failed', { fields: 'status' });
    await notifyVisit(pool, id, 'visit_scheduled');
    return { ok: true };
  });

  /** Rechazar una solicitud (el dueño llama o escribe al cliente para proponer otra hora). */
  app.post('/visits/:id/decline', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const r = await one(`UPDATE visits SET status='cancelled' WHERE id=$1 AND status='requested' RETURNING id`, [id]);
    if (!r) throw new AppError(409, 'validation.failed', { fields: 'status' });
    return { ok: true };
  });

  /** «Voy en camino»: un toque, con hora estimada de llegada. */
  app.post('/visits/:id/on-the-way', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { eta_minutes } = parse(z.object({ eta_minutes: z.number().int().min(1).max(600).default(20) }), req.body ?? {});
    const r = await one(`UPDATE visits SET status='on_the_way' WHERE id=$1 AND status IN ('scheduled','on_the_way') RETURNING id`, [id]);
    if (!r) throw notFound();
    const sent = await notifyVisit(pool, id, 'on_the_way', eta_minutes);
    return { ok: true, sent };
  });
}
