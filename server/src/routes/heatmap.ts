import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { type Db, pool, q } from '../db.js';
import { forwardGeocode } from '../lib/geocode.js';

/** Visitas con dirección escrita y sin GPS: se buscan sus coordenadas (pocas por vez, una sola vez cada una). */
export async function geocodePendingVisits(db: Db = pool, max = 5, fetcher?: typeof fetch) {
  const rows = await q<{ id: string; address: string; client_id: string }>(
    `SELECT id, address, client_id FROM visits
      WHERE lat IS NULL AND geocode_tried_at IS NULL AND address <> '' AND address NOT LIKE 'GPS %' AND status <> 'cancelled'
      ORDER BY scheduled_start DESC LIMIT $1`,
    [max],
    db,
  );
  let found = 0;
  for (const v of rows) {
    const g = await forwardGeocode(v.address, fetcher);
    await q('UPDATE visits SET geocode_tried_at=now(), lat=COALESCE($2, lat), lng=COALESCE($3, lng) WHERE id=$1', [v.id, g?.lat ?? null, g?.lng ?? null], db);
    if (g) {
      found++;
      await q('UPDATE clients SET lat=$2, lng=$3 WHERE id=$1 AND lat IS NULL', [v.client_id, g.lat, g.lng], db);
    }
  }
  return found;
}

/** Agrupa puntos en zonas de ~1,5 km para ver dónde se concentra el trabajo. */
export function zonesOf(points: { lat: number; lng: number; revenue: number; address: string }[]) {
  const cells = new Map<string, { lat: number; lng: number; count: number; revenue_cents: number; label: string }>();
  for (const p of points) {
    const key = `${Math.round(p.lat / 0.014)}:${Math.round(p.lng / 0.02)}`;
    const c = cells.get(key) ?? { lat: 0, lng: 0, count: 0, revenue_cents: 0, label: p.address };
    c.lat += p.lat;
    c.lng += p.lng;
    c.count += 1;
    c.revenue_cents += p.revenue;
    cells.set(key, c);
  }
  return [...cells.values()]
    .map((c) => ({ ...c, lat: c.lat / c.count, lng: c.lng / c.count }))
    .sort((a, b) => b.count - a.count || b.revenue_cents - a.revenue_cents)
    .slice(0, 10);
}

export async function heatmapRoutes(app: FastifyInstance) {
  app.get('/heatmap', { preHandler: requireUser() }, async (req) => {
    const b = parse(z.object({ days: z.coerce.number().int().min(1).max(3650).default(90) }), req.query);
    const since = new Date(Date.now() - b.days * 86_400_000);
    // Trabajo hecho o en curso (las solicitudes sin confirmar y las canceladas no cuentan).
    const visits = await q<{ id: string; lat: number; lng: number; address: string; revenue: number; status: string }>(
      `SELECT v.id, v.lat, v.lng, v.address, v.status,
              COALESCE((SELECT sum(i.total_cents) FROM invoices i WHERE i.order_id=v.order_id AND i.status <> 'void'),0)::int AS revenue
         FROM visits v
        WHERE v.lat IS NOT NULL AND v.scheduled_start >= $1 AND v.scheduled_start <= now() + interval '1 day'
          AND v.status NOT IN ('cancelled','requested')`,
      [since],
    );
    const activity = await q<{ lat: number; lng: number }>(
      `SELECT lat, lng FROM user_locations WHERE kind='action' AND created_at >= $1 AND (accuracy_m IS NULL OR accuracy_m <= 200)`,
      [since],
    );
    const missing = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM visits WHERE lat IS NULL AND scheduled_start >= $1 AND status NOT IN ('cancelled','requested')`,
      [since],
    );
    // Próximas visitas (14 días) para planificar rutas.
    const upcoming = await q(
      `SELECT v.id, v.lat, v.lng, v.address, v.scheduled_start, v.status, c.name AS client_name, ve.make, ve.model
         FROM visits v JOIN clients c ON c.id=v.client_id LEFT JOIN vehicles ve ON ve.id=v.vehicle_id
        WHERE v.scheduled_start >= date_trunc('day', now() AT TIME ZONE 'America/Toronto') AT TIME ZONE 'America/Toronto'
          AND v.scheduled_start < now() + interval '14 days' AND v.status NOT IN ('cancelled','done')
        ORDER BY v.scheduled_start`,
    );
    return {
      visits: visits.map((v) => ({ lat: v.lat, lng: v.lng, revenue_cents: v.revenue })),
      activity,
      zones: zonesOf(visits),
      upcoming,
      missing: missing[0]?.n ?? 0,
    };
  });
}
