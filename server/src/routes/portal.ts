import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parse, rateLimit } from '../app.js';
import { one, q, tx } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import { type Lang, t } from '../lib/i18n.js';
import { enqueue } from '../lib/notify.js';
import { invoicePdf, quotePdf } from '../lib/pdf.js';
import { normalizePhone } from '../lib/phone.js';
import { randomToken, sha256, sixDigitCode } from '../lib/security.js';
import { decideQuote } from '../services/orders.js';
import { config } from '../config.js';
import { saveSignature, sendStored } from './media.js';

const token = z.string().min(20).max(100);

interface PortalCtx {
  clientId: string;
  orderId: string | null;
  lang: Lang;
}

/** Valida el enlace del cliente. Los tokens se guardan como hash, nunca en claro. */
async function resolve(req: FastifyRequest, raw: string): Promise<PortalCtx> {
  rateLimit(req, 'portal', 300, 15 * 60_000);
  const r = await one<{ id: string; client_id: string; order_id: string | null; lang: Lang }>(
    `SELECT ct.id, ct.client_id, ct.order_id, c.lang FROM client_tokens ct JOIN clients c ON c.id=ct.client_id
      WHERE ct.token_hash=$1 AND ct.expires_at > now() AND c.anonymized_at IS NULL`,
    [sha256(raw)],
  );
  if (!r) throw new AppError(401, 'portal.link_invalid');
  await q('UPDATE client_tokens SET last_used_at=now() WHERE id=$1', [r.id]);
  if (!req.headers['x-lang']) req.lang = r.lang;
  return { clientId: r.client_id, orderId: r.order_id, lang: r.lang };
}

async function ownOrder(ctx: PortalCtx, orderId: string) {
  const o = await one('SELECT id FROM orders WHERE id=$1 AND client_id=$2', [orderId, ctx.clientId]);
  if (!o) throw notFound();
}

export async function portalRoutes(app: FastifyInstance) {
  /** Datos públicos del taller (página de confidencialidad). */
  app.get('/public/shop', async () => one('SELECT shop_name, shop_email, shop_phone, shop_address FROM settings WHERE id=1'));

  /** Todo lo que el cliente puede ver: sus órdenes, fotos compartidas, cotizaciones, facturas y visitas. */
  app.get('/portal/:token', async (req) => {
    const p = parse(z.object({ token }), req.params);
    const ctx = await resolve(req, p.token);
    const shop = await one('SELECT shop_name, shop_phone, shop_email, shop_address, taxes_registered FROM settings WHERE id=1');
    const client = await one(
      `SELECT c.id, c.name, c.lang, c.channels, c.phone, c.email,
              (SELECT granted FROM consents WHERE client_id=c.id AND kind='maintenance' ORDER BY created_at DESC LIMIT 1) AS consent_maintenance,
              (SELECT granted FROM consents WHERE client_id=c.id AND kind='promo' ORDER BY created_at DESC LIMIT 1) AS consent_promo
         FROM clients c WHERE c.id=$1`,
      [ctx.clientId],
    );
    const orders = await q<any>(
      `SELECT o.id, o.number, o.status, o.reason, o.created_at, o.promised_at, o.odometer_in, v.make, v.model, v.year, v.plate
         FROM orders o JOIN vehicles v ON v.id=o.vehicle_id WHERE o.client_id=$1
        ORDER BY (o.id = $2) DESC, o.created_at DESC LIMIT 20`,
      [ctx.clientId, ctx.orderId],
    );
    const ids = orders.map((o) => o.id);
    const [history, photos, quotes, qlines, invoices, visits, messages] = await Promise.all([
      q(`SELECT order_id, to_status, created_at FROM order_status_history WHERE order_id = ANY($1) ORDER BY created_at`, [ids]),
      q(`SELECT id, order_id, stage, kind, caption, created_at FROM photos WHERE order_id = ANY($1) AND shared ORDER BY created_at`, [ids]),
      q(`SELECT id, order_id, version, status, subtotal_cents, gst_cents, qst_cents, total_cents, valid_until, sent_at, decided_at
           FROM quotes WHERE order_id = ANY($1) AND status <> 'superseded' ORDER BY version DESC`, [ids]),
      q(`SELECT ql.id, ql.quote_id, ql.kind, ql.description, ql.quantity, ql.unit_price_cents, ql.total_cents, ql.part_condition, ql.decision
           FROM quote_lines ql JOIN quotes qt ON qt.id=ql.quote_id WHERE qt.order_id = ANY($1) ORDER BY ql.position`, [ids]),
      q(`SELECT id, order_id, number, kind, total_cents, paid_cents, status, issued_at FROM invoices WHERE client_id=$1 AND status<>'void' ORDER BY issued_at DESC`, [ctx.clientId]),
      q(`SELECT id, order_id, scheduled_start, scheduled_end, status, address, purpose FROM visits
          WHERE client_id=$1 AND status IN ('scheduled','on_the_way') AND scheduled_end > now() ORDER BY scheduled_start`, [ctx.clientId]),
      q(`SELECT id, order_id, direction, body, created_at FROM client_messages WHERE client_id=$1 AND channel='portal' ORDER BY created_at`, [ctx.clientId]),
    ]);
    return {
      shop,
      client,
      visits,
      invoices,
      orders: orders.map((o) => ({
        ...o,
        history: history.filter((h) => h.order_id === o.id),
        photos: photos.filter((ph) => ph.order_id === o.id),
        quotes: quotes.filter((qt) => qt.order_id === o.id).map((qt) => ({ ...qt, lines: qlines.filter((l) => l.quote_id === qt.id) })),
        messages: messages.filter((m) => m.order_id === o.id),
      })),
    };
  });

  app.get('/portal/:token/photos/:id', async (req, reply) => {
    const p = parse(z.object({ token, id: z.string().uuid() }), req.params);
    const ctx = await resolve(req, p.token);
    const ph = await one<{ storage_key: string; mime: string }>(
      `SELECT ph.storage_key, ph.mime FROM photos ph JOIN orders o ON o.id=ph.order_id WHERE ph.id=$1 AND ph.shared AND o.client_id=$2`,
      [p.id, ctx.clientId],
    );
    if (!ph) throw notFound();
    return sendStored(reply, ph.storage_key, ph.mime);
  });

  app.get('/portal/:token/invoices/:id/pdf', async (req, reply) => {
    const p = parse(z.object({ token, id: z.string().uuid() }), req.params);
    const ctx = await resolve(req, p.token);
    const inv = await one(`SELECT id FROM invoices WHERE id=$1 AND client_id=$2 AND status<>'void'`, [p.id, ctx.clientId]);
    if (!inv) throw notFound();
    const { lang } = parse(z.object({ lang: z.enum(['fr', 'en', 'es']).optional() }), req.query);
    const { buf, number } = await invoicePdf(p.id, lang ?? ctx.lang);
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="facture-${number}.pdf"`);
    return reply.send(buf);
  });

  app.get('/portal/:token/quotes/:id/pdf', async (req, reply) => {
    const p = parse(z.object({ token, id: z.string().uuid() }), req.params);
    const ctx = await resolve(req, p.token);
    const qt = await one(`SELECT qt.id FROM quotes qt JOIN orders o ON o.id=qt.order_id WHERE qt.id=$1 AND o.client_id=$2`, [p.id, ctx.clientId]);
    if (!qt) throw notFound();
    const { buf, name } = await quotePdf(p.id, ctx.lang);
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `inline; filename="evaluation-${name}.pdf"`);
    return reply.send(buf);
  });

  /** El cliente aprueba o rechaza cada línea, con su firma. Se guarda fecha, hora e IP. */
  app.post('/portal/:token/quotes/:id/decision', async (req) => {
    const p = parse(z.object({ token, id: z.string().uuid() }), req.params);
    const ctx = await resolve(req, p.token);
    const b = parse(
      z.object({
        decisions: z.record(z.string().uuid(), z.enum(['approved', 'rejected'])),
        signer_name: z.string().trim().min(1).max(160),
        signature: z.string().max(900_000),
      }),
      req.body,
    );
    return tx(async (c) => {
      const qt = await one<{ order_id: string }>(
        `SELECT qt.order_id FROM quotes qt JOIN orders o ON o.id=qt.order_id WHERE qt.id=$1 AND o.client_id=$2`,
        [p.id, ctx.clientId],
        c,
      );
      if (!qt) throw notFound();
      const sigId = await saveSignature(qt.order_id, 'quote', b.signer_name, b.signature, { ip: req.ip, ua: req.headers['user-agent'] }, c);
      const r = await decideQuote(c, p.id, b.decisions, { kind: 'client' }, { ip: req.ip, signatureId: sigId });
      return { status: r.status };
    });
  });

  app.post('/portal/:token/messages', async (req) => {
    const p = parse(z.object({ token }), req.params);
    const ctx = await resolve(req, p.token);
    rateLimit(req, 'portal-msg', 20, 60 * 60_000);
    const b = parse(z.object({ order_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) }), req.body);
    await ownOrder(ctx, b.order_id);
    return one(`INSERT INTO client_messages (order_id, client_id, direction, channel, body) VALUES ($1,$2,'in','portal',$3) RETURNING id, created_at`, [b.order_id, ctx.clientId, b.body]);
  });

  /** El cliente elige su idioma, sus canales y sus consentimientos. */
  app.patch('/portal/:token/preferences', async (req) => {
    const p = parse(z.object({ token }), req.params);
    const ctx = await resolve(req, p.token);
    const b = parse(
      z.object({
        lang: z.enum(['fr', 'en', 'es']).optional(),
        channels: z.array(z.enum(['sms', 'whatsapp', 'email'])).min(1).max(3).optional(),
        consent_maintenance: z.boolean().optional(),
        consent_promo: z.boolean().optional(),
      }),
      req.body,
    );
    if (b.channels?.includes('email')) {
      const c = await one<{ email: string | null }>('SELECT email FROM clients WHERE id=$1', [ctx.clientId]);
      if (!c?.email) throw new AppError(400, 'validation.failed', { fields: 'email' });
    }
    await q('UPDATE clients SET lang=COALESCE($2,lang), channels=COALESCE($3,channels), updated_at=now() WHERE id=$1', [ctx.clientId, b.lang ?? null, b.channels ?? null]);
    for (const [kind, v] of [['maintenance', b.consent_maintenance], ['promo', b.consent_promo]] as const) {
      if (v !== undefined) await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,$2,$3,'portal')`, [ctx.clientId, kind, v]);
    }
    return { ok: true };
  });

  /** El cliente descarga sus datos (Loi 25). */
  app.get('/portal/:token/export', async (req, reply) => {
    const p = parse(z.object({ token }), req.params);
    const ctx = await resolve(req, p.token);
    const data = {
      exported_at: new Date().toISOString(),
      client: await one('SELECT name, phone, email, address, lang, channels, created_at FROM clients WHERE id=$1', [ctx.clientId]),
      consents: await q('SELECT kind, granted, source, created_at FROM consents WHERE client_id=$1 ORDER BY created_at', [ctx.clientId]),
      vehicles: await q('SELECT v.vin, v.plate, v.make, v.model, v.year FROM vehicles v JOIN vehicle_owners vo ON vo.vehicle_id=v.id WHERE vo.client_id=$1', [ctx.clientId]),
      orders: await q('SELECT number, status, reason, created_at FROM orders WHERE client_id=$1', [ctx.clientId]),
      invoices: await q('SELECT number, kind, total_cents, paid_cents, status, issued_at FROM invoices WHERE client_id=$1', [ctx.clientId]),
      messages: await q('SELECT direction, channel, body, created_at FROM client_messages WHERE client_id=$1', [ctx.clientId]),
    };
    reply.header('Content-Disposition', 'attachment; filename="mes-donnees.json"');
    return data;
  });

  /**
   * Pedir un enlace nuevo: el cliente escribe su teléfono o correo y recibe un código de 6 dígitos.
   * La respuesta es siempre la misma, exista o no el cliente.
   */
  app.post('/portal/request-code', async (req) => {
    rateLimit(req, 'portal-code', 5, 15 * 60_000);
    const { contact } = parse(z.object({ contact: z.string().trim().min(3).max(200) }), req.body);
    const isEmail = contact.includes('@');
    const phone = isEmail ? null : normalizePhone(contact);
    const c = await one<{ id: string }>(
      `SELECT id FROM clients WHERE anonymized_at IS NULL AND (($1::text IS NOT NULL AND lower(email)=lower($1)) OR ($2::text IS NOT NULL AND phone=$2))
        ORDER BY updated_at DESC LIMIT 1`,
      [isEmail ? contact : null, phone],
    );
    if (c) {
      const code = sixDigitCode();
      await q('DELETE FROM portal_codes WHERE client_id=$1', [c.id]);
      await q(`INSERT INTO portal_codes (client_id, code_hash, expires_at) VALUES ($1,$2, now() + interval '10 minutes')`, [c.id, sha256(code)]);
      await enqueue({ event: 'portal_code', clientId: c.id, vars: { code }, channels: [isEmail ? 'email' : 'sms'], to: isEmail ? contact : phone! });
    }
    return { ok: true, message: t(req.lang, 'portal.code_sent') };
  });

  app.post('/portal/verify-code', async (req) => {
    rateLimit(req, 'portal-verify', 10, 15 * 60_000);
    const b = parse(z.object({ contact: z.string().trim().min(3).max(200), code: z.string().regex(/^\d{6}$/) }), req.body);
    const isEmail = b.contact.includes('@');
    const phone = isEmail ? null : normalizePhone(b.contact);
    const row = await one<{ id: string; client_id: string; code_hash: string; attempts: number }>(
      `SELECT pc.id, pc.client_id, pc.code_hash, pc.attempts FROM portal_codes pc JOIN clients c ON c.id=pc.client_id
        WHERE pc.used_at IS NULL AND pc.expires_at > now()
          AND (($1::text IS NOT NULL AND lower(c.email)=lower($1)) OR ($2::text IS NOT NULL AND c.phone=$2))
        ORDER BY pc.expires_at DESC LIMIT 1`,
      [isEmail ? b.contact : null, phone],
    );
    if (!row || row.attempts >= 5) throw new AppError(400, 'portal.code_invalid');
    if (row.code_hash !== sha256(b.code)) {
      await q('UPDATE portal_codes SET attempts=attempts+1 WHERE id=$1', [row.id]);
      throw new AppError(400, 'portal.code_invalid');
    }
    await q('UPDATE portal_codes SET used_at=now() WHERE id=$1', [row.id]);
    const raw = randomToken();
    await q(
      `INSERT INTO client_tokens (client_id, token_hash, expires_at) VALUES ($1,$2, now() + make_interval(days => $3))`,
      [row.client_id, sha256(raw), config.portalLinkDays],
    );
    return { token: raw };
  });
}
