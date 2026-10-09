import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { localParts, localWeekday } from '../src/lib/time.js';
import { Agent, freshApp, setupOwner } from './helpers.js';

let app: FastifyInstance;
let owner: Agent;
let guest: Agent;
beforeEach(async () => {
  app = await freshApp();
  owner = await setupOwner(app);
  guest = new Agent(app);
});
afterAll(async () => {
  await app?.close();
});

async function firstSlot() {
  const r = await guest.get('/api/public/booking/slots');
  expect(r.status).toBe(200);
  expect(r.json.days.length).toBeGreaterThan(0);
  return r.json.days[0].slots[0] as string;
}

const base = { name: 'Sophie Lavoie', phone: '514 555 0142', lang: 'fr', channel: 'sms', address: '12, rue Exemple, Laval', make: 'Honda', model: 'Fit', year: 2017, consent: true };

describe('reservas en línea', () => {
  it('la página pública muestra el taller y los trabajos sin iniciar sesión', async () => {
    const r = await guest.get('/api/public/booking');
    expect(r.status).toBe(200);
    expect(r.json.enabled).toBe(true);
    expect(r.json.work_types.length).toBeGreaterThan(10);
    expect(r.json).not.toHaveProperty('shop_email');
  });

  it('los horarios respetan días, horas, aviso mínimo y duración', async () => {
    const days = (await guest.get('/api/public/booking/slots')).json.days;
    const now = Date.now();
    for (const d of days) {
      const [y, m, day] = d.date.split('-').map(Number);
      expect(localWeekday(y, m, day)).not.toBe(7); // domingo cerrado
      for (const s of d.slots) {
        const p = localParts(new Date(s));
        expect(p.h).toBeGreaterThanOrEqual(8);
        expect(p.h * 60 + p.min + 90).toBeLessThanOrEqual(18 * 60);
        expect(new Date(s).getTime()).toBeGreaterThan(now + 12 * 3600_000 - 60_000);
      }
    }
    expect(days[0].slots.length).toBeLessThanOrEqual(6); // 8:00 a 18:00 en bloques de 1 h 30
  });

  it('una reserva crea cliente, vehículo y cita por confirmar; el horario deja de estar libre', async () => {
    const slot = await firstSlot();
    const wt = (await guest.get('/api/public/booking')).json.work_types.find((w: any) => w.suggested_key === undefined || true);
    const r = await guest.post('/api/public/booking', { ...base, start: slot, work_type_id: wt.id, message: 'Bruit au freinage' });
    expect(r.status).toBe(200);
    const visits = (await owner.get('/api/visits')).json;
    const v = visits.find((x: any) => new Date(x.scheduled_start).toISOString() === new Date(slot).toISOString());
    expect(v).toMatchObject({ status: 'requested', source: 'online', client_name: 'Sophie Lavoie', make: 'Honda', model: 'Fit' });
    expect(v.notes).toContain('Bruit au freinage');
    // Ya no se puede tomar el mismo horario
    expect((await guest.post('/api/public/booking', { ...base, phone: '514 555 0143', start: slot })).status).toBe(409);
    const again = (await guest.get('/api/public/booking/slots')).json.days.flatMap((d: any) => d.slots);
    expect(again).not.toContain(slot);
    // Aparece en «Hoy» para confirmar
    expect((await owner.get('/api/dashboard')).json.bookings).toHaveLength(1);

    // Confirmar: pasa a la agenda y se avisa al cliente
    expect((await owner.post(`/api/visits/${v.id}/confirm`, {})).status).toBe(200);
    expect((await owner.get('/api/dashboard')).json.bookings).toHaveLength(0);
    const { pool } = await import('../src/db.js');
    const n = await pool.query(`SELECT event FROM notifications n JOIN clients c ON c.id=n.client_id WHERE c.name='Sophie Lavoie'`);
    expect(n.rows.map((r) => r.event)).toContain('visit_scheduled');
  });

  it('un cliente que ya existe con ese teléfono no se duplica', async () => {
    const c = (await owner.post('/api/clients', { name: 'Sophie L.', phone: '514 555 0142', lang: 'fr' })).json;
    const slot = await firstSlot();
    await guest.post('/api/public/booking', { ...base, start: slot });
    const list = (await owner.get('/api/clients')).json;
    expect(list.filter((x: any) => x.phone === '+15145550142')).toHaveLength(1);
    expect(list.find((x: any) => x.id === c.id).address).toBe(base.address);
  });

  it('rechaza horarios fuera de lo permitido, sin consentimiento, robots y reservas desactivadas', async () => {
    const slot = await firstSlot();
    const odd = new Date(new Date(slot).getTime() + 17 * 60_000).toISOString();
    expect((await guest.post('/api/public/booking', { ...base, start: odd })).status).toBe(409);
    expect((await guest.post('/api/public/booking', { ...base, start: slot, consent: false })).status).toBe(400);
    expect((await guest.post('/api/public/booking', { ...base, start: slot, website: 'spam' })).status).toBe(400);
    await owner.req('PATCH', '/api/settings', { booking_enabled: false });
    expect((await guest.post('/api/public/booking', { ...base, start: slot })).status).toBe(403);
    expect((await guest.get('/api/public/booking/slots')).json.days).toEqual([]);
  });

  it('rechazar una solicitud libera el horario', async () => {
    const slot = await firstSlot();
    await guest.post('/api/public/booking', { ...base, start: slot });
    const v = (await owner.get('/api/visits')).json.find((x: any) => x.status === 'requested');
    expect((await owner.post(`/api/visits/${v.id}/decline`, {})).status).toBe(200);
    expect((await guest.get('/api/public/booking/slots')).json.days.flatMap((d: any) => d.slots)).toContain(slot);
  });

  it('los ajustes cambian los horarios ofrecidos', async () => {
    await owner.req('PATCH', '/api/settings', { booking_days: [7], booking_start_hour: 10, booking_end_hour: 12, booking_slot_minutes: 60 });
    const days = (await guest.get('/api/public/booking/slots')).json.days;
    for (const d of days) {
      const [y, m, day] = d.date.split('-').map(Number);
      expect(localWeekday(y, m, day)).toBe(7);
      expect(d.slots.length).toBeLessThanOrEqual(2);
    }
  });
});

describe('ubicación del cliente (taller móvil)', () => {
  it('la reserva guarda la ubicación GPS y acepta solo GPS si no escribió dirección', async () => {
    const slot = await firstSlot();
    const r = await guest.post('/api/public/booking', { ...base, address: '', start: slot, location: { lat: 45.5017, lng: -73.5673, accuracy: 18 } });
    expect(r.status).toBe(200);
    const v = (await owner.get('/api/visits')).json.find((x: any) => x.status === 'requested');
    expect(v).toMatchObject({ lat: 45.5017, lng: -73.5673, location_accuracy_m: 18 });
    expect(v.address).toBe('GPS 45.50170, -73.56730');
    const dash = (await owner.get('/api/dashboard')).json.bookings[0];
    expect(dash).toMatchObject({ lat: 45.5017, lng: -73.5673 });
    // Sin dirección ni GPS: no se acepta
    const other = (await guest.get('/api/public/booking/slots')).json.days[0].slots[0];
    expect((await guest.post('/api/public/booking', { ...base, phone: '514 555 0150', address: '', start: other })).status).toBe(400);
  });

  it('el dueño puede agendar con la ubicación actual', async () => {
    const c = (await owner.post('/api/clients', { name: 'Ana', phone: '514 555 0161' })).json;
    const r = await owner.post('/api/visits', { client_id: c.id, scheduled_start: new Date(Date.now() + 86400_000).toISOString(), lat: 45.6, lng: -73.7, notify: false });
    expect(r.status).toBe(200);
    const v = (await owner.get('/api/visits')).json.find((x: any) => x.id === r.json.id);
    expect(v).toMatchObject({ lat: 45.6, lng: -73.7, address: 'GPS 45.60000, -73.70000' });
  });

  it('arma la dirección de OpenStreetMap y no falla si el servicio no responde', async () => {
    const { formatOsmAddress, reverseGeocode } = await import('../src/lib/geocode.js');
    expect(formatOsmAddress({ house_number: '1200', road: 'Rue Sainte-Catherine Ouest', city: 'Montréal', postcode: 'H3B 1K9' })).toBe('1200 Rue Sainte-Catherine Ouest, Montréal, H3B 1K9');
    const ok = (async () => new Response(JSON.stringify({ address: { house_number: '5', road: 'Rue X', town: 'Laval' } }))) as any;
    expect(await reverseGeocode(45.1, -73.1, 'fr', ok)).toBe('5 Rue X, Laval');
    const fail = (async () => { throw new Error('offline'); }) as any;
    expect(await reverseGeocode(45.2, -73.2, 'fr', fail)).toBeNull();
    // La ruta pública responde aunque no haya internet hacia OpenStreetMap
    const r = await guest.get('/api/public/geocode/reverse?lat=45.3&lng=-73.3&lang=fr');
    expect(r.status).toBe(200);
    expect(r.json).toHaveProperty('address');
  });
});
