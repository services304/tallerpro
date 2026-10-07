import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { parse, rateLimit, requireUser, SESSION_COOKIE } from '../app.js';
import { config } from '../config.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { addSuggestedWork } from '../lib/workCatalog.js';
import { AppError } from '../lib/errors.js';
import { t } from '../lib/i18n.js';
import { sendStaffEmail } from '../lib/notify.js';
import { hashPassword, needsRehash, randomToken, sha256, verifyPassword } from '../lib/security.js';

const LOCK_MINUTES = 15;
const MAX_FAILS = 5;
const lang = z.enum(['fr', 'en', 'es']);
const password = z.string().min(8).max(200);

// Hash ficticio para que una cuenta inexistente tarde lo mismo que una existente.
let dummyHash: Promise<string> | null = null;

async function startSession(reply: FastifyReply, userId: string, ua: string | undefined) {
  const token = randomToken();
  await q('INSERT INTO sessions (user_id, token_hash, user_agent) VALUES ($1,$2,$3)', [userId, sha256(token), ua?.slice(0, 300) ?? null]);
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 3600, // la expiración real es por inactividad (servidor)
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.get('/setup/status', async () => {
    const r = await one<{ n: number }>('SELECT count(*)::int AS n FROM users');
    return { needsSetup: r!.n === 0, version: config.version };
  });

  /** Primera cuenta: el dueño (admin y mecánico). Solo funciona si no hay usuarios. */
  app.post('/setup', async (req, reply) => {
    const b = parse(
      z.object({ name: z.string().trim().min(1).max(120), email: z.string().trim().email().max(200), password, lang: lang.default('es'), shopName: z.string().trim().min(1).max(120) }),
      req.body,
    );
    const hash = await hashPassword(b.password);
    const user = await tx(async (c) => {
      await c.query('LOCK TABLE users IN EXCLUSIVE MODE');
      const n = await one<{ n: number }>('SELECT count(*)::int AS n FROM users', [], c);
      if (n!.n > 0) throw new AppError(409, 'auth.setup_done');
      await q('UPDATE settings SET shop_name=$1, shop_email=$2, default_lang=$3 WHERE id=1', [b.shopName, b.email, b.lang === 'es' ? 'fr' : b.lang], c);
      // Lista de trabajos comunes con precio sugerido, lista para usar.
      await addSuggestedWork(c as any);
      return one<{ id: string }>(
        `INSERT INTO users (name, email, role, is_mechanic, password_hash, lang) VALUES ($1,$2,'admin',true,$3,$4) RETURNING id`,
        [b.name, b.email, hash, b.lang],
        c,
      );
    });
    await startSession(reply, user!.id, req.headers['user-agent']);
    return { ok: true };
  });

  app.post('/auth/login', async (req, reply) => {
    rateLimit(req, 'login', 30, 15 * 60_000);
    const b = parse(z.object({ email: z.string().trim().max(200), password: z.string().max(200) }), req.body);
    const u = await one<{ id: string; password_hash: string; active: boolean; failed_attempts: number; locked_until: Date | null }>(
      'SELECT id, password_hash, active, failed_attempts, locked_until FROM users WHERE lower(email)=lower($1)',
      [b.email],
    );
    if (!u || !u.active) {
      dummyHash ??= hashPassword('una-contraseña-cualquiera');
      await verifyPassword(await dummyHash, b.password);
      throw new AppError(401, 'auth.invalid');
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      const minutes = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60_000);
      throw new AppError(429, 'auth.locked', { minutes });
    }
    if (!(await verifyPassword(u.password_hash, b.password))) {
      const fails = u.failed_attempts + 1;
      if (fails >= MAX_FAILS) {
        await q(`UPDATE users SET failed_attempts=0, locked_until=now() + make_interval(mins => $2) WHERE id=$1`, [u.id, LOCK_MINUTES]);
        await audit(req, 'login.locked', 'user', u.id);
        throw new AppError(429, 'auth.locked', { minutes: LOCK_MINUTES });
      }
      await q('UPDATE users SET failed_attempts=$2 WHERE id=$1', [u.id, fails]);
      throw new AppError(401, 'auth.invalid');
    }
    // Migración transparente si cambiaron los parámetros del hash.
    const newHash = needsRehash(u.password_hash) ? await hashPassword(b.password) : null;
    await q('UPDATE users SET failed_attempts=0, locked_until=NULL, password_hash=COALESCE($2, password_hash) WHERE id=$1', [u.id, newHash]);
    await startSession(reply, u.id, req.headers['user-agent']);
    return { ok: true };
  });

  app.post('/auth/logout', async (req, reply) => {
    if (req.user) await q('DELETE FROM sessions WHERE id=$1', [req.user.session_id]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireUser() }, async (req) => {
    const s = await one('SELECT shop_name, default_lang FROM settings WHERE id=1');
    return { user: req.user, shop: s, version: config.version };
  });

  app.patch('/auth/me', { preHandler: requireUser() }, async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), lang: lang.optional(), phone: z.string().max(40).nullable().optional() }), req.body);
    await q('UPDATE users SET name=COALESCE($2,name), lang=COALESCE($3,lang), phone=COALESCE($4,phone) WHERE id=$1', [req.user!.id, b.name ?? null, b.lang ?? null, b.phone ?? null]);
    return { ok: true };
  });

  /** Cambiar la contraseña cierra todas las demás sesiones. */
  app.post('/auth/password', { preHandler: requireUser() }, async (req) => {
    rateLimit(req, 'pwchange', 10, 15 * 60_000);
    const b = parse(z.object({ current: z.string().max(200), next: password }), req.body);
    const u = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [req.user!.id]);
    if (!(await verifyPassword(u!.password_hash, b.current))) throw new AppError(400, 'auth.wrong_current');
    await q('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user!.id, await hashPassword(b.next)]);
    await q('DELETE FROM sessions WHERE user_id=$1 AND id<>$2', [req.user!.id, req.user!.session_id]);
    await audit(req, 'password.change', 'user', req.user!.id);
    return { ok: true };
  });

  /** Siempre la misma respuesta, exista o no la cuenta. */
  app.post('/auth/forgot', async (req) => {
    rateLimit(req, 'forgot', 5, 15 * 60_000);
    const b = parse(z.object({ email: z.string().trim().max(200) }), req.body);
    const u = await one<{ id: string; email: string; lang: 'fr' | 'en' | 'es' }>('SELECT id, email, lang FROM users WHERE lower(email)=lower($1) AND active', [b.email]);
    if (u) {
      const token = randomToken();
      await q(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '30 minutes')`, [u.id, sha256(token)]);
      const link = `${config.publicUrl}/reset?token=${token}`;
      const subject = { es: 'Cambiar tu contraseña', en: 'Reset your password', fr: 'Changer votre mot de passe' }[u.lang];
      const body = {
        es: `Para cambiar tu contraseña abre este enlace (válido 30 minutos): ${link}\nSi no lo pediste, ignora este mensaje.`,
        en: `To reset your password open this link (valid 30 minutes): ${link}\nIf you didn't ask for it, ignore this message.`,
        fr: `Pour changer votre mot de passe, ouvrez ce lien (valide 30 minutes) : ${link}\nSi vous n'avez rien demandé, ignorez ce message.`,
      }[u.lang];
      await sendStaffEmail(u.email, subject, body).catch((e) => req.log.error(e));
    }
    return { ok: true, message: t(req.lang, 'auth.reset_sent') };
  });

  app.post('/auth/reset', async (req) => {
    rateLimit(req, 'reset', 10, 15 * 60_000);
    const b = parse(z.object({ token: z.string().min(10).max(200), password }), req.body);
    const r = await one<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()',
      [sha256(b.token)],
    );
    if (!r) throw new AppError(400, 'auth.reset_invalid');
    await tx(async (c) => {
      await q('UPDATE password_resets SET used_at=now() WHERE id=$1', [r.id], c);
      await q('UPDATE users SET password_hash=$2, failed_attempts=0, locked_until=NULL WHERE id=$1', [r.user_id, await hashPassword(b.password)], c);
      await q('DELETE FROM sessions WHERE user_id=$1', [r.user_id], c);
    });
    return { ok: true };
  });

  // ---- Usuarios del taller (solo admin). Fase 1: normalmente solo el dueño. ----
  app.get('/users', { preHandler: requireUser('admin') }, async () =>
    q('SELECT id, name, email, phone, role, is_mechanic, lang, active, created_at FROM users ORDER BY created_at'),
  );

  app.post('/users', { preHandler: requireUser('admin') }, async (req) => {
    const b = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
        role: z.enum(['admin', 'reception', 'mechanic']),
        is_mechanic: z.boolean().default(false),
        password,
        lang: lang.default('es'),
      }),
      req.body,
    );
    const u = await one<{ id: string }>(
      `INSERT INTO users (name, email, role, is_mechanic, password_hash, lang) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.name, b.email, b.role, b.is_mechanic || b.role === 'mechanic', await hashPassword(b.password), b.lang],
    );
    await audit(req, 'user.create', 'user', u!.id, null, { email: b.email, role: b.role });
    return u;
  });
}
