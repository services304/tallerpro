import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { ARGON_OPTS } from '../src/lib/security.js';
import argon2 from 'argon2';
import { Agent, freshApp, provider, setupOwner } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await freshApp();
});
afterAll(async () => {
  await app?.close();
});

describe.each(['es', 'en', 'fr'] as const)('cuentas y sesiones (%s)', (lang) => {
  it('la primera cuenta es el dueño y solo se puede crear una vez', async () => {
    const a = new Agent(app, lang);
    expect((await a.get('/api/setup/status')).json.needsSetup).toBe(true);
    await setupOwner(app, lang);
    expect((await a.get('/api/setup/status')).json.needsSetup).toBe(false);
    const again = await a.post('/api/setup', { name: 'X', email: 'x@x.ca', password: '12345678', shopName: 'X' });
    expect(again.status).toBe(409);
    expect(again.json.message).toBe(
      { es: 'La cuenta del dueño ya fue creada.', en: "The owner's account has already been created.", fr: 'Le compte du propriétaire a déjà été créé.' }[lang],
    );
  });

  it('inicia sesión, guarda la contraseña con Argon2id y responde igual si la cuenta no existe', async () => {
    await setupOwner(app, lang);
    const row = (await pool.query('SELECT password_hash FROM users')).rows[0];
    expect(row.password_hash.startsWith('$argon2id$')).toBe(true);
    const a = new Agent(app, lang);
    const bad = await a.post('/api/auth/login', { email: 'nadie@x.ca', password: 'cualquiera' });
    const wrong = await a.post('/api/auth/login', { email: 'dueno@taller.test', password: 'incorrecta' });
    expect(bad.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(bad.json.message).toBe(wrong.json.message);
    const ok = await a.post('/api/auth/login', { email: 'DUENO@taller.test', password: 'clave-segura-123' });
    expect(ok.status).toBe(200);
    expect((await a.get('/api/auth/me')).json.user.role).toBe('admin');
  });

  it('bloquea 15 min tras 5 intentos fallidos', async () => {
    await setupOwner(app, lang);
    const a = new Agent(app, lang);
    for (let i = 0; i < 4; i++) expect((await a.post('/api/auth/login', { email: 'dueno@taller.test', password: 'mala' })).status).toBe(401);
    const fifth = await a.post('/api/auth/login', { email: 'dueno@taller.test', password: 'mala' });
    expect(fifth.status).toBe(429);
    expect(fifth.json.message).toContain('15');
    const good = await a.post('/api/auth/login', { email: 'dueno@taller.test', password: 'clave-segura-123' });
    expect(good.status).toBe(429);
  });
});

describe('sesiones', () => {
  it('cambiar la contraseña cierra las demás sesiones', async () => {
    const a = await setupOwner(app);
    const b = new Agent(app);
    await b.post('/api/auth/login', { email: 'dueno@taller.test', password: 'clave-segura-123' });
    expect((await b.get('/api/auth/me')).status).toBe(200);
    const r = await a.post('/api/auth/password', { current: 'clave-segura-123', next: 'otra-clave-456' });
    expect(r.status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(200);
    expect((await b.get('/api/auth/me')).status).toBe(401);
  });

  it('la sesión expira tras 8 h sin uso', async () => {
    const a = await setupOwner(app);
    await pool.query(`UPDATE sessions SET last_used_at = now() - interval '9 hours'`);
    const r = await a.get('/api/auth/me');
    expect(r.status).toBe(401);
    expect(r.json.error).toBe('auth.required');
  });

  it('migra contraseñas con parámetros viejos al iniciar sesión', async () => {
    await setupOwner(app);
    const old = await argon2.hash('clave-segura-123', { ...ARGON_OPTS, timeCost: 1, memoryCost: 8192 });
    await pool.query('UPDATE users SET password_hash=$1', [old]);
    const a = new Agent(app);
    expect((await a.post('/api/auth/login', { email: 'dueno@taller.test', password: 'clave-segura-123' })).status).toBe(200);
    const now = (await pool.query('SELECT password_hash FROM users')).rows[0].password_hash;
    expect(now).not.toBe(old);
    expect(now).toContain(`m=${ARGON_OPTS.memoryCost},p=${ARGON_OPTS.parallelism},t=${ARGON_OPTS.timeCost}`);
  });

  it('recupera la contraseña con un enlace de 30 min y la misma respuesta exista o no la cuenta', async () => {
    await setupOwner(app);
    const a = new Agent(app);
    const r1 = await a.post('/api/auth/forgot', { email: 'nadie@x.ca' });
    const r2 = await a.post('/api/auth/forgot', { email: 'dueno@taller.test' });
    expect(r1.json).toEqual(r2.json);
    const mail = provider.sent.at(-1)!;
    expect(mail.to).toBe('dueno@taller.test');
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.body)![1]!;
    expect((await a.post('/api/auth/reset', { token, password: 'nueva-clave-789' })).status).toBe(200);
    expect((await a.post('/api/auth/reset', { token, password: 'otra-mas-000' })).status).toBe(400);
    expect((await a.post('/api/auth/login', { email: 'dueno@taller.test', password: 'nueva-clave-789' })).status).toBe(200);
  });
});

describe('protecciones del servidor', () => {
  it('rechaza peticiones sin sesión y escrituras sin la cabecera anti-CSRF', async () => {
    const a = await setupOwner(app);
    expect((await new Agent(app).get('/api/clients')).status).toBe(401);
    const r = await a.req('POST', '/api/clients', { name: 'X', phone: '5145550000' }, { 'x-requested-with': '' });
    expect(r.status).toBe(403);
  });

  it('envía cabeceras contra clickjacking y la versión', async () => {
    const r = await new Agent(app).get('/api/version');
    expect(r.raw.headers['x-frame-options']).toBe('DENY');
    expect(String(r.raw.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(r.raw.headers['x-app-version']).toBe(r.json.version);
  });

  it('un mecánico no ve ajustes de administración', async () => {
    const a = await setupOwner(app);
    await a.post('/api/users', { name: 'Ayudante', email: 'ayu@taller.test', role: 'mechanic', password: 'clave-ayudante-1' });
    const m = new Agent(app);
    await m.post('/api/auth/login', { email: 'ayu@taller.test', password: 'clave-ayudante-1' });
    expect((await m.patch('/api/settings', { visit_fee_cents: 1 })).status).toBe(403);
    expect((await m.get('/api/users')).status).toBe(403);
  });

  it('valida montos y campos en el servidor', async () => {
    const a = await setupOwner(app);
    const r = await a.post('/api/work-types', { name: 'Frenos', mode: 'fixed', price_cents: -5 });
    expect(r.status).toBe(400);
    expect(r.json.message).toContain('price_cents');
    expect((await a.post('/api/work-types', { name: 'Frenos', mode: 'otro', price_cents: 100 })).status).toBe(400);
  });
});
