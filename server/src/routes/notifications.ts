import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { config } from '../config.js';
import { one, q } from '../db.js';
import { notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';
import { safeEqual } from '../lib/security.js';

const STOP_WORDS = ['stop', 'arret', 'arrêt', 'unsubscribe', 'cancel', 'end', 'quit', 'desabonner', 'désabonner', 'baja'];

/** Firma de Twilio: HMAC-SHA1 de la URL + parámetros ordenados, con el token de la cuenta. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((s, k) => s + k + params[k], url);
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export async function notificationRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  app.get('/notifications', { preHandler: requireUser() }, async (req) => {
    const b = parse(z.object({ status: z.enum(['queued', 'manual', 'sent', 'delivered', 'failed', 'skipped']).optional() }), req.query);
    return q(
      `SELECT n.id, n.event, n.channel, n.to_address, n.status, n.error, n.attempts, n.scheduled_for, n.sent_at, n.created_at,
              c.name AS client_name, o.number AS order_number, n.order_id, n.client_id
         FROM notifications n LEFT JOIN clients c ON c.id=n.client_id LEFT JOIN orders o ON o.id=n.order_id
        WHERE ($1::text IS NULL OR n.status=$1) ORDER BY n.created_at DESC LIMIT 200`,
      [b.status ?? null],
    );
  });

  /** Avisos preparados que el dueño debe enviar desde su celular (modo manual). */
  app.get('/notifications/manual', { preHandler: requireUser() }, async () =>
    q(
      `SELECT n.id, n.event, n.channel, n.to_address, n.subject, n.body, n.created_at, n.order_id, n.client_id,
              c.name AS client_name, o.number AS order_number
         FROM notifications n LEFT JOIN clients c ON c.id=n.client_id LEFT JOIN orders o ON o.id=n.order_id
        WHERE n.status='manual' ORDER BY n.created_at`,
    ),
  );

  /** El dueño lo envió (sent) o decidió no enviarlo (skipped). */
  app.post('/notifications/:id/manual', { preHandler: requireUser() }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const { result, channel } = parse(z.object({ result: z.enum(['sent', 'skipped']), channel: z.enum(['sms', 'whatsapp', 'email']).optional() }), req.body);
    const r = await one(
      `UPDATE notifications SET status=$2, channel=COALESCE($3, channel), sent_at=CASE WHEN $2='sent' THEN now() END, provider_id='manual'
        WHERE id=$1 AND status='manual' RETURNING id`,
      [id, result, channel ?? null],
    );
    if (!r) throw notFound();
    return { ok: true };
  });

  app.post('/notifications/:id/retry', { preHandler: requireUser() }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const r = await one(`UPDATE notifications SET status='queued', attempts=0, error=NULL, scheduled_for=now() WHERE id=$1 AND status='failed' RETURNING id`, [id]);
    if (!r) throw notFound();
    return { ok: true };
  });

  /** Gasto del mes por canal (SMS y WhatsApp se cobran por mensaje). */
  app.get('/notifications/stats', { preHandler: requireUser('admin') }, async () =>
    q(
      `SELECT channel, status, count(*)::int AS n FROM notifications
        WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'America/Toronto') AT TIME ZONE 'America/Toronto'
        GROUP BY channel, status ORDER BY channel, status`,
    ),
  );

  /**
   * SMS / WhatsApp entrantes (Twilio). «STOP» da de baja al cliente de todos los avisos;
   * cualquier otro texto llega a la bandeja de su orden abierta más reciente.
   */
  app.post('/webhooks/twilio', async (req, reply) => {
    const params = (req.body ?? {}) as Record<string, string>;
    if (config.sms.provider === 'twilio') {
      const expected = twilioSignature(config.sms.twilioToken, `${config.publicUrl}/api/webhooks/twilio`, params);
      const got = String(req.headers['x-twilio-signature'] ?? '');
      if (!got || !safeEqual(expected, got)) return reply.status(403).send('forbidden');
    } else if (config.env === 'production') {
      return reply.status(404).send('not found');
    }
    const from = normalizePhone(String(params.From ?? '').replace(/^whatsapp:/, ''));
    const body = String(params.Body ?? '').trim();
    const channel = String(params.From ?? '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
    reply.header('Content-Type', 'text/xml');
    if (!from || !body) return '<Response/>';
    const client = await one<{ id: string }>('SELECT id FROM clients WHERE phone=$1 AND anonymized_at IS NULL ORDER BY updated_at DESC LIMIT 1', [from]);
    if (!client) return '<Response/>';
    if (STOP_WORDS.includes(body.toLowerCase().normalize('NFC'))) {
      for (const kind of ['service', 'maintenance', 'promo']) {
        await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,$2,false,'sms_stop')`, [client.id, kind]);
      }
      return '<Response/>';
    }
    const order = await one<{ id: string }>(
      `SELECT id FROM orders WHERE client_id=$1 AND status NOT IN ('closed','cancelled') ORDER BY created_at DESC LIMIT 1`,
      [client.id],
    );
    await q(`INSERT INTO client_messages (order_id, client_id, direction, channel, body) VALUES ($1,$2,'in',$3,$4)`, [order?.id ?? null, client.id, channel, body.slice(0, 2000)]);
    return '<Response/>';
  });
}
