import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, rateLimit } from '../app.js';
import { type Db, one, pool, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { AppError } from '../lib/errors.js';
import type { Lang } from '../lib/i18n.js';
import { enqueue, sendStaffEmail } from '../lib/notify.js';
import { normalizePhone } from '../lib/phone.js';
import { coordsLabel, reverseGeocode } from '../lib/geocode.js';
import { fmtDate, fmtTime, localParts, localToUtc, localWeekday } from '../lib/time.js';

type BookingSettings = {
  shop_address: string; dropoff_enabled: boolean; dropoff_fee_cents: number;
  shop_name: string; shop_phone: string; shop_email: string; visit_fee_cents: number; default_lang: Lang; messaging_mode: 'auto' | 'manual';
  booking_enabled: boolean; booking_days: number[]; booking_start_hour: number; booking_end_hour: number;
  booking_slot_minutes: number; booking_min_notice_hours: number; booking_max_days: number;
};

async function bookingSettings(db: Db = pool) {
  return (await one<BookingSettings>('SELECT * FROM settings WHERE id=1', [], db))!;
}

/**
 * Horarios libres: días y horas de trabajo, con aviso mínimo, sin chocar con otras visitas
 * (incluidas las solicitudes aún sin confirmar).
 */
export async function freeSlots(db: Db, s: BookingSettings, now = new Date()) {
  const earliest = new Date(now.getTime() + s.booking_min_notice_hours * 3600_000);
  const today = localParts(now);
  const busy = await q<{ scheduled_start: Date; scheduled_end: Date }>(
    `SELECT scheduled_start, scheduled_end FROM visits
      WHERE status NOT IN ('cancelled','done') AND scheduled_end > $1 AND scheduled_start < $2`,
    [now, new Date(now.getTime() + (s.booking_max_days + 2) * 86_400_000)],
    db,
  );
  const days: { date: string; slots: string[] }[] = [];
  for (let d = 0; d <= s.booking_max_days; d++) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.day + d));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, day = base.getUTCDate();
    if (!s.booking_days.includes(localWeekday(y, m, day))) continue;
    const slots: string[] = [];
    for (let t = s.booking_start_hour * 60; t + s.booking_slot_minutes <= s.booking_end_hour * 60; t += s.booking_slot_minutes) {
      const start = localToUtc(y, m, day, Math.floor(t / 60), t % 60);
      const end = new Date(start.getTime() + s.booking_slot_minutes * 60_000);
      if (start < earliest) continue;
      if (busy.some((b) => new Date(b.scheduled_start) < end && new Date(b.scheduled_end) > start)) continue;
      slots.push(start.toISOString());
    }
    if (slots.length) days.push({ date: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, slots });
  }
  return days;
}

const bookingInput = z.object({
  work_type_id: z.string().uuid().nullable().optional(),
  work_type_ids: z.array(z.string().uuid()).max(12).default([]),
  start: z.string().datetime({ offset: true }),
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)),
  lang: z.enum(['fr', 'en', 'es']).default('fr'),
  channel: z.enum(['sms', 'whatsapp', 'email']).default('sms'),
  address: z.string().trim().max(400).default(''),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).optional() }).nullable().optional(),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(60),
  year: z.number().int().min(1950).max(2100).nullable().optional(),
  message: z.string().trim().max(1000).default(''),
  consent: z.literal(true),
  service_mode: z.enum(['home', 'dropoff']).default('home'),
  website: z.string().max(0).optional(), // trampa para robots: debe quedar vacío
});

export async function bookingRoutes(app: FastifyInstance) {
  /** Datos públicos para la página de reservas. */
  app.get('/public/booking', async () => {
    const s = await bookingSettings();
    const types = await q(
      `SELECT id, names, name, category, mode, price_cents, est_minutes FROM work_types WHERE active ORDER BY category, price_cents, name`,
    );
    return {
      enabled: s.booking_enabled,
      shop_name: s.shop_name,
      shop_phone: s.shop_phone,
      visit_fee_cents: s.visit_fee_cents,
      dropoff_enabled: s.dropoff_enabled,
      dropoff_fee_cents: s.dropoff_fee_cents,
      shop_address: s.dropoff_enabled ? s.shop_address : '',
      default_lang: s.default_lang,
      slot_minutes: s.booking_slot_minutes,
      work_types: types,
    };
  });

  /** Dirección aproximada a partir del GPS del teléfono (para prellenar el campo). */
  app.get('/public/geocode/reverse', async (req) => {
    rateLimit(req, 'geocode', 30, 10 * 60_000);
    const b = parse(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), lang: z.enum(['fr', 'en', 'es']).default('fr') }), req.query);
    return { address: await reverseGeocode(b.lat, b.lng, b.lang) };
  });

  app.get('/public/booking/slots', async (_req, reply) => {
    // Siempre al día: una hora recién reservada no debe aparecer a nadie más.
    reply.header('Cache-Control', 'no-store');
    const s = await bookingSettings();
    if (!s.booking_enabled) return { days: [] };
    return { days: await freeSlots(pool, s) };
  });

  /** El cliente pide una cita: queda «por confirmar» en la agenda del dueño. */
  app.post('/public/booking', async (req) => {
    rateLimit(req, 'booking', 6, 60 * 60_000);
    const b = parse(bookingInput, req.body);
    if (b.website) throw new AppError(400, 'validation.failed', { fields: 'website' });
    const phone = normalizePhone(b.phone);
    if (!phone) throw new AppError(400, 'validation.failed', { fields: 'phone' });
    if (b.channel === 'email' && !b.email) throw new AppError(400, 'validation.failed', { fields: 'email' });
    const home = b.service_mode === 'home';
    // A domicilio: hace falta una dirección escrita o la ubicación GPS (o ambas). Si trae el vehículo, no.
    if (home && b.address.length < 5 && !b.location) throw new AppError(400, 'validation.failed', { fields: 'address' });
    const loc = home ? b.location ?? null : null;
    const clientAddress = home ? (b.address.length >= 5 ? b.address : coordsLabel(loc!.lat, loc!.lng)) : b.address;

    const result = await tx(async (c) => {
      // Una reserva a la vez, para que dos clientes no tomen el mismo horario.
      await c.query('SELECT pg_advisory_xact_lock(7311)');
      const s = await bookingSettings(c);
      if (!s.booking_enabled) throw new AppError(403, 'booking.disabled');
      if (!home && !s.dropoff_enabled) throw new AppError(400, 'validation.failed', { fields: 'service_mode' });
      const address = home ? clientAddress : s.shop_address || 'Atelier / taller (le client apporte le véhicule)';
      const fee = home ? s.visit_fee_cents : s.dropoff_fee_cents;
      const wanted = new Date(b.start).getTime();
      const free = (await freeSlots(c, s)).some((d) => d.slots.some((x) => new Date(x).getTime() === wanted));
      if (!free) throw new AppError(409, 'booking.slot_taken');

      // Cliente: si ya existe con ese teléfono, se usa (y se completan datos que falten).
      let client = await one<{ id: string; address: string; email: string | null }>(
        'SELECT id, address, email FROM clients WHERE phone=$1 AND anonymized_at IS NULL ORDER BY created_at LIMIT 1',
        [phone],
        c,
      );
      if (client) {
        await q(
          `UPDATE clients SET address = CASE WHEN address='' THEN $2 ELSE address END, email = COALESCE(email, $3),
                  lat = COALESCE($4, lat), lng = COALESCE($5, lng), updated_at=now() WHERE id=$1`,
          [client.id, clientAddress, b.email ?? null, loc?.lat ?? null, loc?.lng ?? null],
          c,
        );
      } else {
        client = await one(
          `INSERT INTO clients (name, phone, email, address, lang, channels, notes_internal, lat, lng) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, address, email`,
          [b.name, phone, b.email ?? null, clientAddress, b.lang, [b.channel], home ? 'Reservó en línea.' : 'Reservó en línea (trae el vehículo).', loc?.lat ?? null, loc?.lng ?? null],
          c,
        );
        await q(`INSERT INTO consents (client_id, kind, granted, source) VALUES ($1,'service',true,'booking')`, [client!.id], c);
      }
      // Vehículo: el mismo si ya lo tiene registrado.
      let vehicle = await one<{ id: string }>(
        `SELECT v.id FROM vehicles v JOIN vehicle_owners o ON o.vehicle_id=v.id AND o.until IS NULL
          WHERE o.client_id=$1 AND lower(v.make)=lower($2) AND lower(v.model)=lower($3) LIMIT 1`,
        [client!.id, b.make, b.model],
        c,
      );
      if (!vehicle) {
        vehicle = await one('INSERT INTO vehicles (make, model, year) VALUES ($1,$2,$3) RETURNING id', [b.make, b.model, b.year ?? null], c);
        await q('INSERT INTO vehicle_owners (vehicle_id, client_id) VALUES ($1,$2)', [vehicle!.id, client!.id], c);
      }
      // El cliente puede marcar varios trabajos (o ninguno: «no estoy seguro»).
      const ids = [...new Set([...(b.work_type_id ? [b.work_type_id] : []), ...b.work_type_ids])];
      const wts = ids.length
        ? await q<{ id: string; names: Record<string, string>; name: string }>('SELECT id, names, name FROM work_types WHERE id = ANY($1) AND active', [ids], c)
        : [];
      const ordered = ids.map((id) => wts.find((w) => w.id === id)).filter(Boolean) as typeof wts;
      const wt = ordered[0] ?? null;
      const job = ordered.map((w) => w.names.es || w.names.fr || w.name).join(', ');
      const start = new Date(b.start);
      const end = new Date(start.getTime() + s.booking_slot_minutes * 60_000);
      const v = await one<{ id: string }>(
        `INSERT INTO visits (client_id, vehicle_id, purpose, address, scheduled_start, scheduled_end, visit_fee_cents, notes, status, source, work_type_id, client_message, lat, lng, location_accuracy_m, service_mode)
         VALUES ($1,$2,'diagnosis',$3,$4,$5,$6,$7,'requested','online',$8,$9,$10,$11,$12,$13) RETURNING id`,
        [client!.id, vehicle!.id, address, start, end, fee, [job, b.message].filter(Boolean).join(' — '), wt?.id ?? null, b.message,
          loc?.lat ?? null, loc?.lng ?? null, loc?.accuracy != null ? Math.round(loc.accuracy) : null, b.service_mode],
        c,
      );
      // Al cliente: «recibimos tu solicitud» (solo si los mensajes salen solos; en modo manual lo ve en pantalla).
      if (s.messaging_mode === 'auto') {
        await enqueue(
          { event: 'booking_received', clientId: client!.id, vars: { date: fmtDate(start, b.lang), time: fmtTime(start, b.lang), address } },
          c,
        );
      }
      return { visitId: v!.id, clientId: client!.id, s, start, job, address };
    });

    await audit(req, 'booking.request', 'visit', result.visitId, null, { start: b.start, source: 'online' });
    if (result.s.shop_email) {
      const when = `${fmtDate(result.start, 'es')} ${fmtTime(result.start, 'es')}`;
      await sendStaffEmail(
        result.s.shop_email,
        `Nueva cita por confirmar — ${b.name}`,
        `${b.name} (${b.phone}) pidió una cita el ${when}.\n${b.make} ${b.model}${b.year ? ` ${b.year}` : ''}\n${home ? '' : '*** TRAE EL VEHÍCULO ***\n'}${result.address}${loc ? `\nhttps://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}` : ''}\n${result.job}${b.message ? `\n«${b.message}»` : ''}\n\nConfírmala en la Agenda de la app.`,
      ).catch((e) => req.log.error(e));
    }
    return { ok: true, start: result.start.toISOString() };
  });
}
