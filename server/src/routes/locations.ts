import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q } from '../db.js';
import { localDayRange, localToUtc } from '../lib/time.js';

export type Geo = { lat: number; lng: number; accuracy: number | null };

/** Encabezado X-Geo: «lat,lng,precisión» (lo manda la app del personal si tiene una posición reciente). */
export function parseGeoHeader(v: unknown): Geo | null {
  if (typeof v !== 'string' || v.length > 80) return null;
  const [a, b, c] = v.split(',').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a!) > 90 || Math.abs(b!) > 180) return null;
  return { lat: a!, lng: b!, accuracy: Number.isFinite(c) ? Math.round(c!) : null };
}

/** Distancia aproximada en metros. */
export function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

let trackCache: { v: boolean; at: number } | null = null;
export async function trackingEnabled() {
  if (trackCache && Date.now() - trackCache.at < 30_000) return trackCache.v;
  const r = await one<{ track_staff_location: boolean }>('SELECT track_staff_location FROM settings WHERE id=1');
  trackCache = { v: Boolean(r?.track_staff_location), at: Date.now() };
  return trackCache.v;
}
export function resetTrackingCache() {
  trackCache = null;
}

/** Acciones que no vale la pena registrar con ubicación. */
const SKIP = ['/api/me/location', '/api/auth/logout', '/api/auth/me'];

/** Después de una acción exitosa del personal, guarda dónde estaba (si mandó su posición). */
export async function recordActionLocation(req: FastifyRequest, statusCode: number) {
  if (!req.user || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || statusCode >= 400) return;
  const route = req.routeOptions?.url ?? '';
  if (!route.startsWith('/api/') || SKIP.includes(route)) return;
  const geo = parseGeoHeader(req.headers['x-geo']);
  if (!geo || !(await trackingEnabled())) return;
  await q(`INSERT INTO user_locations (user_id, lat, lng, accuracy_m, kind, action) VALUES ($1,$2,$3,$4,'action',$5)`, [
    req.user.id, geo.lat, geo.lng, geo.accuracy, `${req.method} ${route}`,
  ]);
}

export async function locationRoutes(app: FastifyInstance) {
  /** Posición al abrir la app y cada cierto tiempo mientras se usa (no guarda si no se movió). */
  app.post('/me/location', { preHandler: requireUser() }, async (req) => {
    const b = parse(
      z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).nullable().optional(), kind: z.enum(['open', 'heartbeat']).default('heartbeat') }),
      req.body,
    );
    if (!(await trackingEnabled())) return { saved: false, tracking: false };
    // Sin moverse (menos de 150 m): no se repite el registro (15 min en movimiento, 3 min al reabrir la app).
    const last = await one<{ lat: number; lng: number; created_at: Date }>(
      'SELECT lat, lng, created_at FROM user_locations WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.user!.id],
    );
    const windowMs = (b.kind === 'open' ? 3 : 15) * 60_000;
    if (last && Date.now() - new Date(last.created_at).getTime() < windowMs && meters(last, b) < 150) return { saved: false, tracking: true };
    await q(`INSERT INTO user_locations (user_id, lat, lng, accuracy_m, kind) VALUES ($1,$2,$3,$4,$5)`, [
      req.user!.id, b.lat, b.lng, b.accuracy != null ? Math.round(b.accuracy) : null, b.kind,
    ]);
    return { saved: true, tracking: true };
  });

  /** Registro de un día (solo el dueño). */
  app.get('/locations', { preHandler: requireUser('admin') }, async (req) => {
    const b = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), user_id: z.string().uuid().optional() }), req.query);
    let range = localDayRange(new Date());
    if (b.date) {
      const [y, m, d] = b.date.split('-').map(Number);
      range = localDayRange(new Date(localToUtc(y!, m!, d!, 12).getTime()));
    }
    const rows = await q(
      `SELECT l.id, l.lat, l.lng, l.accuracy_m, l.kind, l.action, l.created_at, u.name AS user_name, l.user_id
         FROM user_locations l JOIN users u ON u.id=l.user_id
        WHERE l.created_at >= $1 AND l.created_at < $2 AND ($3::uuid IS NULL OR l.user_id=$3)
        ORDER BY l.created_at`,
      [range.start, range.end, b.user_id ?? null],
    );
    const days = await q<{ day: string; n: number }>(
      `SELECT to_char(created_at AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD') AS day, count(*)::int AS n
         FROM user_locations WHERE created_at > now() - interval '60 days' GROUP BY 1 ORDER BY 1 DESC`,
    );
    return { rows, days };
  });
}
