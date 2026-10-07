import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { Agent, flushAll, freshApp, PNG_1x1, provider, setupOwner } from './helpers.js';

let app: FastifyInstance;
let owner: Agent;

beforeEach(async () => {
  app = await freshApp();
  owner = await setupOwner(app);
  await owner.patch('/api/settings', { messaging_mode: 'manual' });
});
afterAll(async () => {
  await app?.close();
});

describe('modo manual: el dueño envía desde su celular (sin costo)', () => {
  it('una instalación nueva empieza en modo manual', async () => {
    const fresh = await freshApp();
    const r = await pool.query('SELECT messaging_mode FROM settings');
    expect(r.rows[0].messaging_mode).toBe('manual');
    await fresh.close();
  });

  it('SMS y WhatsApp quedan como un solo aviso por enviar; el correo sale solo', async () => {
    const c = await owner.post('/api/clients', { name: 'Marie Côté', phone: '438 555 0001', email: 'marie@x.ca', lang: 'fr', channels: ['sms', 'whatsapp', 'email'] });
    await owner.post('/api/visits', { client_id: c.json.id, address: '1 rue X, Longueuil', scheduled_start: new Date(Date.now() + 3 * 86400_000).toISOString() });
    await flushAll();
    const rows = (await pool.query(`SELECT channel, status FROM notifications ORDER BY channel`)).rows;
    expect(rows).toEqual([
      { channel: 'email', status: 'sent' },
      { channel: 'whatsapp', status: 'manual' },
    ]);
    expect(provider.sent.filter((m) => m.channel !== 'email')).toHaveLength(0);

    const pending = (await owner.get('/api/notifications/manual')).json;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ client_name: 'Marie Côté', to_address: '+14385550001', channel: 'whatsapp' });
    expect(pending[0].body).toContain('visite est confirmée');
    expect((await owner.get('/api/dashboard')).json.manualPending).toBe(1);

    expect((await owner.post(`/api/notifications/${pending[0].id}/manual`, { result: 'sent', channel: 'sms' })).status).toBe(200);
    expect((await owner.get('/api/notifications/manual')).json).toHaveLength(0);
    const sent = (await pool.query(`SELECT channel, status, sent_at FROM notifications WHERE id=$1`, [pending[0].id])).rows[0];
    expect(sent.channel).toBe('sms');
    expect(sent.status).toBe('sent');
    expect(sent.sent_at).toBeTruthy();
    expect((await owner.post(`/api/notifications/${pending[0].id}/manual`, { result: 'sent' })).status).toBe(404);
  });

  it('una nueva versión de la cotización reemplaza el aviso que no se había enviado', async () => {
    const c = await owner.post('/api/clients', { name: 'Luc Dubé', phone: '514 555 9999', channels: ['sms'] });
    const v = await owner.post('/api/vehicles', { client_id: c.json.id, make: 'Ford', model: 'F-150' });
    const o = await owner.post('/api/orders', { client_id: c.json.id, vehicle_id: v.json.id, reason: 'Ruido' });
    await owner.post(`/api/orders/${o.json.id}/signatures`, { kind: 'intake', signer_name: 'Luc', image: PNG_1x1 });
    await owner.post(`/api/orders/${o.json.id}/status`, { to: 'diagnosis' });
    await owner.post(`/api/orders/${o.json.id}/lines`, { kind: 'labor', description: 'Diagnostic', quantity: 1, unit_price_cents: 5000 });
    await owner.post(`/api/orders/${o.json.id}/quotes`, {});
    await owner.post(`/api/orders/${o.json.id}/quotes`, {});
    const pending = (await owner.get('/api/notifications/manual')).json.filter((n: any) => n.event === 'quote_ready');
    expect(pending).toHaveLength(1);
    // El enlace del aviso abre el portal del cliente
    const token = /\/p\/([A-Za-z0-9_-]+)/.exec(pending[0].body)![1]!;
    expect((await new Agent(app).get(`/api/portal/${token}`)).status).toBe(200);
  });

  it('el modo automático sigue funcionando si se activa', async () => {
    await owner.patch('/api/settings', { messaging_mode: 'auto' });
    const c = await owner.post('/api/clients', { name: 'Ana', phone: '514 555 7777', channels: ['sms'] });
    await owner.post('/api/visits', { client_id: c.json.id, address: 'X', scheduled_start: new Date(Date.now() + 3 * 86400_000).toISOString() });
    await flushAll();
    expect((await pool.query(`SELECT status FROM notifications`)).rows).toEqual([{ status: 'sent' }]);
  });
});
