import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { meters, parseGeoHeader } from '../src/routes/locations.js';
import { Agent, freshApp, setupOwner } from './helpers.js';

let app: FastifyInstance;
let owner: Agent;
beforeEach(async () => {
  app = await freshApp();
  owner = await setupOwner(app);
});
afterAll(async () => {
  await app?.close();
});

const GEO = { 'x-geo': '45.5017,-73.5673,12' };

describe('registro de ubicación del personal', () => {
  it('lee el encabezado y mide distancias', () => {
    expect(parseGeoHeader('45.5,-73.5,10')).toEqual({ lat: 45.5, lng: -73.5, accuracy: 10 });
    expect(parseGeoHeader('999,0')).toBeNull();
    expect(parseGeoHeader(undefined)).toBeNull();
    expect(Math.round(meters({ lat: 45.5, lng: -73.5 }, { lat: 45.501, lng: -73.5 }))).toBe(111);
  });

  it('guarda al abrir la app y no repite si no se movió', async () => {
    expect((await owner.post('/api/me/location', { lat: 45.5, lng: -73.5, accuracy: 10, kind: 'open' })).json.saved).toBe(true);
    expect((await owner.post('/api/me/location', { lat: 45.5001, lng: -73.5, accuracy: 10 })).json.saved).toBe(false);
    expect((await owner.post('/api/me/location', { lat: 45.52, lng: -73.5, accuracy: 10 })).json.saved).toBe(true);
    const r = (await owner.get('/api/locations')).json;
    expect(r.rows.map((x: any) => x.kind)).toEqual(['open', 'heartbeat']);
    expect(r.rows[0].user_name).toBeTruthy();
    expect(r.days[0].n).toBe(2);
  });

  it('registra dónde se hizo cada acción', async () => {
    const c = await owner.req('POST', '/api/clients', { name: 'Ana', phone: '514 555 0170' }, GEO);
    expect(c.status).toBe(200);
    await owner.req('POST', '/api/clients', { name: '' }, GEO); // falla: no se registra
    await owner.post('/api/clients', { name: 'Sin GPS', phone: '514 555 0171' }); // sin posición: no se registra
    const rows = (await owner.get('/api/locations')).json.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'action', action: 'POST /api/clients', lat: 45.5017, lng: -73.5673, accuracy_m: 12 });
  });

  it('se puede desactivar en Ajustes', async () => {
    await owner.req('PATCH', '/api/settings', { track_staff_location: false });
    expect((await owner.post('/api/me/location', { lat: 45.5, lng: -73.5, kind: 'open' })).json).toEqual({ saved: false, tracking: false });
    await owner.req('POST', '/api/clients', { name: 'Ana', phone: '514 555 0172' }, GEO);
    expect((await owner.get('/api/locations')).json.rows).toHaveLength(0);
  });

  it('solo el dueño ve el registro', async () => {
    const r = await owner.post('/api/users', { name: 'Mecánico', email: 'm@x.test', role: 'mechanic', password: 'clave-segura-123' });
    expect(r.status).toBe(200);
    const mech = new Agent(app);
    await mech.post('/api/auth/login', { email: 'm@x.test', password: 'clave-segura-123' });
    expect((await mech.post('/api/me/location', { lat: 45.5, lng: -73.5, kind: 'open' })).json.saved).toBe(true);
    expect((await mech.get('/api/locations')).status).toBe(403);
    expect((await owner.get('/api/locations')).json.rows[0].user_name).toBe('Mecánico');
  });
});
