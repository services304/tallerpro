import type { FastifyInstance } from 'fastify';
import { requireUser } from '../app.js';
import { one, q } from '../db.js';
import { OPEN_STATUSES } from '../lib/orderStates.js';
import { localDayRange } from '../lib/time.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  app.get('/dashboard', async (req) => {
    const { start, end } = localDayRange(new Date());
    const isAdmin = req.user!.role === 'admin';
    const [visitsToday, byStatus, readyOld, pendingQuotes, failed, messages, money] = await Promise.all([
      q(
        `SELECT v.id, v.scheduled_start, v.scheduled_end, v.status, v.address, v.purpose, v.order_id, v.client_id,
                c.name AS client_name, c.phone AS client_phone, ve.make, ve.model, ve.year, o.number AS order_number
           FROM visits v JOIN clients c ON c.id=v.client_id LEFT JOIN vehicles ve ON ve.id=v.vehicle_id LEFT JOIN orders o ON o.id=v.order_id
          WHERE v.scheduled_start >= $1 AND v.scheduled_start < $2 AND v.status <> 'cancelled'
          ORDER BY v.scheduled_start`,
        [start, end],
      ),
      q(`SELECT status, count(*)::int AS n FROM orders WHERE status = ANY($1) GROUP BY status`, [OPEN_STATUSES]),
      q(
        `SELECT o.id, o.number, c.name AS client_name, h.created_at AS ready_since
           FROM orders o JOIN clients c ON c.id=o.client_id
           JOIN LATERAL (SELECT created_at FROM order_status_history WHERE order_id=o.id AND to_status='ready' ORDER BY created_at DESC LIMIT 1) h ON true
          WHERE o.status='ready' ORDER BY h.created_at`,
      ),
      q(
        `SELECT qt.id, qt.order_id, qt.total_cents, qt.sent_at, o.number, c.name AS client_name
           FROM quotes qt JOIN orders o ON o.id=qt.order_id JOIN clients c ON c.id=o.client_id
          WHERE qt.status='sent' ORDER BY qt.sent_at`,
      ),
      one<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE status='failed' AND created_at > now() - interval '7 days'`),
      q(
        `SELECT m.id, m.order_id, m.body, m.created_at, c.name AS client_name, o.number
           FROM client_messages m JOIN clients c ON c.id=m.client_id LEFT JOIN orders o ON o.id=m.order_id
          WHERE m.direction='in' AND m.created_at > now() - interval '7 days' ORDER BY m.created_at DESC LIMIT 10`,
      ),
      isAdmin
        ? one<{ today: number; month: number; receivable: number }>(
            `SELECT
               (SELECT COALESCE(sum(amount_cents),0)::int FROM payments WHERE paid_at >= $1 AND paid_at < $2) AS today,
               (SELECT COALESCE(sum(amount_cents),0)::int FROM payments
                 WHERE paid_at >= date_trunc('month', now() AT TIME ZONE 'America/Toronto') AT TIME ZONE 'America/Toronto') AS month,
               (SELECT COALESCE(sum(total_cents - paid_cents),0)::int FROM invoices WHERE status IN ('issued','partial')) AS receivable`,
            [start, end],
          )
        : Promise.resolve(null),
    ]);
    return { visitsToday, byStatus, readyOld, pendingQuotes, failedNotifications: failed!.n, messages, money };
  });
}
