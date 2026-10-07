import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { config } from './config.js';
import { one, q } from './db.js';
import { AppError } from './lib/errors.js';
import { pickLang, t, type Lang } from './lib/i18n.js';
import { sha256 } from './lib/security.js';
import { authRoutes } from './routes/auth.js';
import { clientRoutes } from './routes/clients.js';
import { vehicleRoutes } from './routes/vehicles.js';
import { catalogRoutes } from './routes/catalog.js';
import { visitRoutes } from './routes/visits.js';
import { orderRoutes } from './routes/orders.js';
import { mediaRoutes } from './routes/media.js';
import { partsRoutes } from './routes/parts.js';
import { quoteRoutes } from './routes/quotes.js';
import { invoiceRoutes } from './routes/invoices.js';
import { notificationRoutes } from './routes/notifications.js';
import { portalRoutes } from './routes/portal.js';
import { importRoutes } from './routes/imports.js';
import { dashboardRoutes } from './routes/dashboard.js';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'reception' | 'mechanic';
  is_mechanic: boolean;
  lang: Lang;
  session_id: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    lang: Lang;
  }
}

export const SESSION_COOKIE = 'tp_session';

/** Lanza 401 si no hay sesión, 403 si el rol no está permitido. */
export function requireUser(...roles: SessionUser['role'][]) {
  return async (req: FastifyRequest) => {
    if (!req.user) throw new AppError(401, 'auth.required');
    if (roles.length && !roles.includes(req.user.role)) throw new AppError(403, 'auth.forbidden');
  };
}

/** Valida datos con zod; si fallan, error 400 traducido con la lista de campos. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const fields = [...new Set(r.error.issues.map((i) => i.path.join('.') || '—'))].join(', ');
    throw new AppError(400, 'validation.failed', { fields });
  }
  return r.data;
}

/** Limitador simple en memoria (por IP + clave). Suficiente para un solo servidor. */
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(req: FastifyRequest, key: string, max: number, windowMs: number) {
  const k = `${key}:${req.ip}`;
  const now = Date.now();
  const b = buckets.get(k);
  if (!b || b.reset < now) {
    buckets.set(k, { n: 1, reset: now + windowMs });
    return;
  }
  b.n++;
  if (b.n > max) throw new AppError(429, 'rate_limited');
}
export function resetRateLimits() {
  buckets.clear();
}

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 60 * 1024 * 1024, files: 1, fields: 20 } });

  app.decorateRequest('user', null);
  app.decorateRequest('lang', 'fr');

  // Cabeceras de seguridad: sin iframes (clickjacking), sin sniffing, CSP estricta.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; " +
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (config.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('X-App-Version', config.version);
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  // Idioma + sesión + protección CSRF (cabecera propia obligatoria en escrituras).
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    req.lang = pickLang(req.headers['x-lang'] as string | undefined, req.headers['accept-language']);

    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (unsafe && req.headers['x-requested-with'] !== 'tallerpro' && !req.url.startsWith('/api/webhooks/')) {
      throw new AppError(403, 'auth.forbidden');
    }

    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const row = await one<SessionUser & { last_used_at: Date; active: boolean }>(
      `SELECT u.id, u.name, u.email, u.role, u.is_mechanic, u.lang, u.active, s.id AS session_id, s.last_used_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1`,
      [sha256(token)],
    );
    if (!row || !row.active) return;
    const idleMs = Date.now() - new Date(row.last_used_at).getTime();
    if (idleMs > config.sessionIdleHours * 3600_000) {
      await q('DELETE FROM sessions WHERE id = $1', [row.session_id]);
      return;
    }
    if (idleMs > 60_000) await q('UPDATE sessions SET last_used_at = now() WHERE id = $1', [row.session_id]);
    req.user = { id: row.id, name: row.name, email: row.email, role: row.role, is_mechanic: row.is_mechanic, lang: row.lang, session_id: row.session_id };
    if (!req.headers['x-lang']) req.lang = row.lang;
  });

  app.setErrorHandler((err: any, req, reply: FastifyReply) => {
    const lang = req.lang ?? 'fr';
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: err.code, message: t(lang, err.code, err.params) });
    }
    if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.status(413).send({ error: 'upload.too_big', message: t(lang, 'upload.too_big', { mb: 60 }) });
    }
    if (err.validation || err.statusCode === 400) {
      return reply.status(400).send({ error: 'validation.failed', message: t(lang, 'validation.failed', { fields: err.message }) });
    }
    req.log.error(err);
    if (config.env !== 'production' && config.env !== 'test') console.error(err);
    return reply.status(500).send({ error: 'server.error', message: t(lang, 'server.error') });
  });

  app.get('/api/health', async () => {
    await q('SELECT 1');
    return { ok: true, version: config.version };
  });
  app.get('/api/version', async () => ({ version: config.version, demo: config.demo }));

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(clientRoutes, { prefix: '/api' });
  await app.register(vehicleRoutes, { prefix: '/api' });
  await app.register(catalogRoutes, { prefix: '/api' });
  await app.register(visitRoutes, { prefix: '/api' });
  await app.register(orderRoutes, { prefix: '/api' });
  await app.register(mediaRoutes, { prefix: '/api' });
  await app.register(partsRoutes, { prefix: '/api' });
  await app.register(quoteRoutes, { prefix: '/api' });
  await app.register(invoiceRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });
  await app.register(portalRoutes, { prefix: '/api' });
  await app.register(importRoutes, { prefix: '/api' });
  await app.register(dashboardRoutes, { prefix: '/api' });

  // La app web compilada (PWA). Cualquier ruta que no sea /api devuelve index.html.
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      wildcard: false,
      // Archivos con huella (/assets/…) no cambian nunca; el resto se revisa en cada visita.
      setHeaders: (res, filePath) => {
        res.header('Cache-Control', /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'not_found', message: t(req.lang, 'not_found') });
      }
      // Un archivo de la app que no existe (p. ej. de una versión anterior) es un 404, no la página.
      if (req.url.startsWith('/assets/') || /\.(js|css|png|webp|svg|json|woff2?)(\?|$)/.test(req.url)) {
        return reply.status(404).type('text/plain').send('not found');
      }
      reply.header('Cache-Control', 'no-cache');
      return reply.type('text/html').sendFile('index.html');
    });
  }

  return app;
}
