import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { type Db, one, pool, q, tx } from '../db.js';
import { defaultTemplates, fill, type Lang, type NotificationEvent } from './i18n.js';
import { randomToken, sha256 } from './security.js';
import { nextAllowedTime } from './time.js';

export type Channel = 'sms' | 'whatsapp' | 'email';

/** Eventos que se envían aunque sea horario de silencio. */
const URGENT: NotificationEvent[] = ['on_the_way', 'portal_code', 'ready'];

/** Crea un enlace privado al portal del cliente (válido N días). */
export async function portalLink(clientId: string, orderId: string | null, db: Db = pool): Promise<string> {
  const token = randomToken();
  await q(
    `INSERT INTO client_tokens (client_id, order_id, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(days => $4))`,
    [clientId, orderId, sha256(token), config.portalLinkDays],
    db,
  );
  return `${config.publicUrl}/p/${token}`;
}

async function template(event: NotificationEvent, channel: Channel, lang: Lang, db: Db) {
  const row = await one<{ subject: string; body: string }>(
    `SELECT subject, body FROM notification_templates WHERE event=$1 AND channel=$2 AND lang=$3`,
    [event, channel, lang],
    db,
  );
  return row ?? defaultTemplates[lang][event];
}

export interface EnqueueOpts {
  event: NotificationEvent;
  clientId: string;
  orderId?: string | null;
  vars?: Record<string, string | number | undefined>;
  /** Si es true, crea y agrega {link} al portal del cliente. */
  withLink?: boolean;
  /** Forzar canales (p. ej. el código del portal va al canal que el cliente pidió). */
  channels?: Channel[];
  to?: string;
}

/**
 * Pone en cola las notificaciones de un evento en los canales elegidos por el cliente, en su idioma.
 * Respeta el horario de silencio y la baja (STOP) del cliente.
 */
export async function enqueue(opts: EnqueueOpts, db: Db = pool): Promise<number> {
  const c = await one<{ id: string; name: string; phone: string | null; email: string | null; lang: Lang; channels: Channel[]; anonymized_at: Date | null }>(
    `SELECT id, name, phone, email, lang, channels, anonymized_at FROM clients WHERE id=$1`,
    [opts.clientId],
    db,
  );
  if (!c || c.anonymized_at) return 0;

  const optOut = await one<{ granted: boolean }>(
    `SELECT granted FROM consents WHERE client_id=$1 AND kind='service' ORDER BY created_at DESC LIMIT 1`,
    [c.id],
    db,
  );
  if (optOut && !optOut.granted && opts.event !== 'portal_code') return 0;

  const s = await one<{ shop_name: string; quiet_start_hour: number; quiet_end_hour: number }>(
    'SELECT shop_name, quiet_start_hour, quiet_end_hour FROM settings WHERE id=1',
    [],
    db,
  );
  const vars: Record<string, string | number | undefined> = { name: c.name.split(' ')[0], shop: s!.shop_name, ...opts.vars };
  if (opts.withLink) vars.link = await portalLink(c.id, opts.orderId ?? null, db);

  const when = URGENT.includes(opts.event) ? new Date() : nextAllowedTime(new Date(), s!.quiet_start_hour, s!.quiet_end_hour);
  let n = 0;
  for (const ch of opts.channels ?? c.channels) {
    const to = opts.to ?? (ch === 'email' ? c.email : c.phone);
    if (!to) continue;
    const tpl = await template(opts.event, ch, c.lang, db);
    await q(
      `INSERT INTO notifications (client_id, order_id, event, channel, to_address, subject, body, scheduled_for)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [c.id, opts.orderId ?? null, opts.event, ch, to, fill(tpl.subject, vars), fill(tpl.body, vars), when],
      db,
    );
    n++;
  }
  return n;
}

// ---------- Proveedores ----------

export interface SendResult {
  providerId: string;
}

export interface Provider {
  send(channel: Channel, to: string, subject: string, body: string): Promise<SendResult>;
}

/** En desarrollo: no envía nada, solo lo deja en el registro. */
export class LogProvider implements Provider {
  sent: { channel: Channel; to: string; subject: string; body: string }[] = [];
  async send(channel: Channel, to: string, subject: string, body: string) {
    this.sent.push({ channel, to, subject, body });
    if (config.env !== 'test') console.log(`[${channel} → ${to}] ${subject ? subject + ' | ' : ''}${body}`);
    return { providerId: `log-${Date.now()}` };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class RealProvider implements Provider {
  private mailer = config.email.provider === 'smtp' ? nodemailer.createTransport(config.email.smtpUrl) : null;
  private log = new LogProvider();

  async send(channel: Channel, to: string, subject: string, body: string): Promise<SendResult> {
    if (channel === 'email') {
      if (!this.mailer) return this.log.send(channel, to, subject, body);
      const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">${escapeHtml(body).replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1">$1</a>',
      )}</div>`;
      const r = await this.mailer.sendMail({ from: config.email.from, to, subject, text: body, html });
      return { providerId: r.messageId };
    }
    if (config.sms.provider !== 'twilio') return this.log.send(channel, to, subject, body);
    const from = channel === 'whatsapp' ? `whatsapp:${config.sms.twilioWhatsappFrom}` : config.sms.twilioFrom;
    const dest = channel === 'whatsapp' ? `whatsapp:${to}` : to;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.sms.twilioSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${config.sms.twilioSid}:${config.sms.twilioToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: dest, From: from, Body: body }),
    });
    const j = (await r.json()) as { sid?: string; message?: string };
    if (!r.ok) throw new Error(j.message ?? `Twilio ${r.status}`);
    return { providerId: j.sid! };
  }
}

export let provider: Provider = new RealProvider();
export function setProvider(p: Provider) {
  provider = p;
}

const MAX_ATTEMPTS = 3;

/**
 * Envía lo que esté en cola y vencido. Si un canal falla 3 veces, prueba con otro canal del cliente
 * (correo o SMS) que no se haya usado para ese mismo aviso.
 */
export async function processQueue(limit = 20): Promise<number> {
  const rows = await tx((c) =>
    q<{ id: string; channel: Channel; to_address: string; subject: string; body: string; attempts: number; client_id: string; order_id: string | null; event: string }>(
      `UPDATE notifications SET attempts = attempts + 1
        WHERE id IN (SELECT id FROM notifications WHERE status='queued' AND scheduled_for <= now()
                     ORDER BY scheduled_for LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING id, channel, to_address, subject, body, attempts, client_id, order_id, event`,
      [limit],
      c,
    ),
  );
  for (const n of rows) {
    try {
      const r = await provider.send(n.channel, n.to_address, n.subject, n.body);
      await q(`UPDATE notifications SET status='sent', provider_id=$2, sent_at=now(), error=NULL WHERE id=$1`, [n.id, r.providerId]);
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      if (n.attempts >= MAX_ATTEMPTS) {
        await q(`UPDATE notifications SET status='failed', error=$2 WHERE id=$1`, [n.id, msg]);
        await fallback(n);
      } else {
        await q(`UPDATE notifications SET error=$2, scheduled_for = now() + make_interval(mins => $3) WHERE id=$1`, [n.id, msg, n.attempts * 5]);
      }
    }
  }
  return rows.length;
}

async function fallback(n: { client_id: string; order_id: string | null; event: string; channel: Channel; subject: string; body: string }) {
  const c = await one<{ phone: string | null; email: string | null }>('SELECT phone, email FROM clients WHERE id=$1', [n.client_id]);
  if (!c) return;
  const used = new Set(
    (
      await q<{ channel: Channel }>(
        `SELECT channel FROM notifications WHERE client_id=$1 AND event=$2 AND order_id IS NOT DISTINCT FROM $3`,
        [n.client_id, n.event, n.order_id],
      )
    ).map((r) => r.channel),
  );
  const alt: [Channel, string | null][] = [
    ['email', c.email],
    ['sms', c.phone],
  ];
  const next = alt.find(([ch, addr]) => addr && !used.has(ch));
  if (!next) return;
  await q(
    `INSERT INTO notifications (client_id, order_id, event, channel, to_address, subject, body) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [n.client_id, n.order_id, n.event, next[0], next[1], n.subject, n.body],
  );
}

/** Correo directo a un usuario del taller (p. ej. recuperar contraseña). No pasa por la cola. */
export async function sendStaffEmail(to: string, subject: string, body: string) {
  await provider.send('email', to, subject, body);
}
