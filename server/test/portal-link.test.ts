import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Agent, freshApp, PNG_1x1, setupOwner } from './helpers.js';

let app: FastifyInstance;
let owner: Agent;
beforeEach(async () => {
  app = await freshApp();
  owner = await setupOwner(app);
});
afterAll(async () => {
  await app?.close();
});

describe('enlace del cliente bajo demanda', () => {
  it('crea un enlace que abre el portal y avisa si hay cotización por aprobar', async () => {
    const c = (await owner.post('/api/clients', { name: 'Marie Gagnon', phone: '438 555 0102', lang: 'fr' })).json;
    const v = (await owner.post('/api/vehicles', { client_id: c.id, make: 'Toyota', model: 'RAV4' })).json;
    const o = (await owner.post('/api/orders', { client_id: c.id, vehicle_id: v.id })).json;
    let r = (await owner.post(`/api/orders/${o.id}/portal-link`, {})).json;
    expect(r.url).toMatch(/\/p\/[A-Za-z0-9_-]+$/);
    expect(r.message).toContain('Bonjour Marie');
    expect(r.message).toContain(r.url);
    expect(r.pending).toBe(0);
    expect(r.phone).toBe('+14385550102');
    // El cliente lo abre sin cuenta
    const guest = new Agent(app);
    const token = r.url.split('/p/')[1];
    const portal = await guest.get(`/api/portal/${token}`);
    expect(portal.status).toBe(200);
    expect(portal.json.orders[0].number).toBe(o.number);
    // Con cotización enviada, el mensaje lo dice
    await owner.post(`/api/orders/${o.id}/signatures`, { kind: 'intake', signer_name: 'Marie', image: PNG_1x1 });
    await owner.post(`/api/orders/${o.id}/status`, { to: 'diagnosis' });
    await owner.post(`/api/orders/${o.id}/lines`, { kind: 'labor', description: 'Freins', quantity: 1, unit_price_cents: 12000 });
    await owner.post(`/api/orders/${o.id}/quotes`, {});
    r = (await owner.post(`/api/orders/${o.id}/portal-link`, {})).json;
    expect(r.pending).toBe(1);
    expect(r.message).toContain('approuvez');
    expect((await new Agent(app).post(`/api/orders/${o.id}/portal-link`, {})).status).toBe(401);
  });
});
