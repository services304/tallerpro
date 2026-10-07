import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q } from '../db.js';
import { audit } from '../lib/audit.js';
import { notFound } from '../lib/errors.js';
import { defaultTemplates, LANGS, NOTIFICATION_EVENTS } from '../lib/i18n.js';
import { normalizePhone } from '../lib/phone.js';

const cents = z.number().int().min(0).max(100_000_000);

export async function catalogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  // ---------- Ajustes del taller ----------
  app.get('/settings', async () => one('SELECT * FROM settings WHERE id=1'));

  app.patch('/settings', { preHandler: requireUser('admin') }, async (req) => {
    const b = parse(
      z.object({
        shop_name: z.string().trim().min(1).max(120),
        shop_address: z.string().trim().max(300),
        shop_phone: z.string().trim().max(40),
        shop_email: z.string().trim().max(200),
        taxes_registered: z.boolean(),
        gst_number: z.string().trim().max(40),
        qst_number: z.string().trim().max(40),
        visit_fee_cents: cents,
        labor_rate_cents: cents,
        parts_margin_bp: z.number().int().min(0).max(100_000),
        quote_valid_days: z.number().int().min(1).max(365),
        default_lang: z.enum(['fr', 'en', 'es']),
        quiet_start_hour: z.number().int().min(0).max(23),
        quiet_end_hour: z.number().int().min(0).max(23),
        warranty_text: z.object({ fr: z.string().max(1000), en: z.string().max(1000), es: z.string().max(1000) }),
      }).partial(),
      req.body,
    );
    const before = await one('SELECT * FROM settings WHERE id=1');
    const keys = Object.keys(b);
    if (keys.length) {
      const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
      await q(`UPDATE settings SET ${sets}, updated_at=now() WHERE id=1`, keys.map((k) => (k === 'warranty_text' ? JSON.stringify((b as any)[k]) : (b as any)[k])));
      await audit(req, 'settings.update', 'settings', '1', before, b);
    }
    return one('SELECT * FROM settings WHERE id=1');
  });

  // ---------- Tipos de trabajo (precio por tipo) ----------
  const workType = z.object({
    name: z.string().trim().min(1).max(120),
    mode: z.enum(['fixed', 'hourly']),
    price_cents: cents,
    est_minutes: z.number().int().min(1).max(10_000).nullable().optional(),
    active: z.boolean().default(true),
  });

  app.get('/work-types', async () => q('SELECT * FROM work_types ORDER BY active DESC, name'));
  app.post('/work-types', { preHandler: requireUser('admin') }, async (req) => {
    const b = parse(workType, req.body);
    return one(
      'INSERT INTO work_types (name, mode, price_cents, est_minutes, active) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [b.name, b.mode, b.price_cents, b.est_minutes ?? null, b.active],
    );
  });
  app.patch('/work-types/:id', { preHandler: requireUser('admin') }, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(workType.partial(), req.body);
    const cur = await one('SELECT * FROM work_types WHERE id=$1', [id]);
    if (!cur) throw notFound();
    const r = await one(
      'UPDATE work_types SET name=$2, mode=$3, price_cents=$4, est_minutes=$5, active=$6 WHERE id=$1 RETURNING *',
      [id, b.name ?? cur.name, b.mode ?? cur.mode, b.price_cents ?? cur.price_cents, b.est_minutes === undefined ? cur.est_minutes : b.est_minutes, b.active ?? cur.active],
    );
    if (b.price_cents !== undefined && b.price_cents !== cur.price_cents) await audit(req, 'price.change', 'work_type', id, { price_cents: cur.price_cents }, { price_cents: b.price_cents });
    return r;
  });

  // ---------- Proveedores de repuestos ----------
  const supplier = z.object({
    name: z.string().trim().min(1).max(160),
    contact_name: z.string().trim().max(120).default(''),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
    notes: z.string().max(2000).default(''),
    active: z.boolean().default(true),
  });
  app.get('/suppliers', async () => q('SELECT * FROM suppliers ORDER BY active DESC, name'));
  app.post('/suppliers', async (req) => {
    const b = parse(supplier, req.body);
    return one(
      'INSERT INTO suppliers (name, contact_name, phone, email, notes, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [b.name, b.contact_name, normalizePhone(b.phone) ?? b.phone ?? null, b.email ?? null, b.notes, b.active],
    );
  });
  app.patch('/suppliers/:id', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    const b = parse(supplier.partial(), req.body);
    const cur = await one('SELECT * FROM suppliers WHERE id=$1', [id]);
    if (!cur) throw notFound();
    return one(
      'UPDATE suppliers SET name=$2, contact_name=$3, phone=$4, email=$5, notes=$6, active=$7 WHERE id=$1 RETURNING *',
      [
        id,
        b.name ?? cur.name,
        b.contact_name ?? cur.contact_name,
        b.phone === undefined ? cur.phone : normalizePhone(b.phone) ?? b.phone ?? null,
        b.email === undefined ? cur.email : b.email,
        b.notes ?? cur.notes,
        b.active ?? cur.active,
      ],
    );
  });

  // ---------- Plantillas de notificación ----------
  app.get('/templates', async () => {
    const custom = await q('SELECT event, channel, lang, subject, body FROM notification_templates');
    const out = [];
    for (const lang of LANGS)
      for (const event of NOTIFICATION_EVENTS)
        for (const channel of ['sms', 'whatsapp', 'email'] as const) {
          const c = custom.find((x) => x.event === event && x.channel === channel && x.lang === lang);
          const d = defaultTemplates[lang][event];
          out.push({ event, channel, lang, subject: c?.subject ?? d.subject, body: c?.body ?? d.body, custom: Boolean(c) });
        }
    return out;
  });
  app.put('/templates', { preHandler: requireUser('admin') }, async (req) => {
    const b = parse(
      z.object({
        event: z.enum(NOTIFICATION_EVENTS),
        channel: z.enum(['sms', 'whatsapp', 'email']),
        lang: z.enum(['fr', 'en', 'es']),
        subject: z.string().max(200).default(''),
        body: z.string().min(1).max(1500),
        reset: z.boolean().default(false),
      }),
      req.body,
    );
    if (b.reset) {
      await q('DELETE FROM notification_templates WHERE event=$1 AND channel=$2 AND lang=$3', [b.event, b.channel, b.lang]);
    } else {
      await q(
        `INSERT INTO notification_templates (event, channel, lang, subject, body) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (event, channel, lang) DO UPDATE SET subject=EXCLUDED.subject, body=EXCLUDED.body`,
        [b.event, b.channel, b.lang, b.subject, b.body],
      );
    }
    return { ok: true };
  });
}
