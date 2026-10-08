import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_CLIENTS, STARTER_INVENTORY } from '../src/lib/sampleData.js';
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

describe('datos para empezar', () => {
  it('crea 8 clientes de ejemplo con su vehículo, una sola vez', async () => {
    const r = await owner.post('/api/samples/clients', {});
    expect(r.json).toEqual({ created: 8 });
    expect(SAMPLE_CLIENTS).toHaveLength(8);
    const list = (await owner.get('/api/clients')).json;
    const items = Array.isArray(list) ? list : list.items ?? list.clients;
    expect(items.filter((c: any) => c.is_sample)).toHaveLength(8);
    const one = items.find((c: any) => c.name === 'Carlos Ramírez');
    const d = (await owner.get(`/api/clients/${one.id}`)).json;
    expect(d.vehicles[0]).toMatchObject({ make: 'Hyundai', model: 'Elantra' });
    expect((await owner.post('/api/samples/clients', {})).status).toBe(409);
    expect((await owner.get('/api/samples/status')).json).toMatchObject({ clients: 8 });
  });

  it('borra los clientes de ejemplo con sus órdenes y facturas, sin tocar los reales', async () => {
    await owner.post('/api/samples/clients', {});
    const real = await owner.post('/api/clients', { name: 'Cliente Real', phone: '514 555 0199' });
    const stock = (await owner.post('/api/inventory', { name: 'Huile', unit: 'l', quantity: 10, cost_cents: 800, price_cents: 1400 })).json;
    const list = (await owner.get('/api/clients')).json;
    const items = Array.isArray(list) ? list : list.items ?? list.clients;
    const s = items.find((c: any) => c.name === 'Jean Tremblay');
    const veh = (await owner.get(`/api/clients/${s.id}`)).json.vehicles[0];
    const o = (await owner.post('/api/orders', { client_id: s.id, vehicle_id: veh.id })).json;
    await owner.post(`/api/orders/${o.id}/signatures`, { kind: 'intake', signer_name: 'J', image: PNG_1x1 });
    await owner.post(`/api/orders/${o.id}/status`, { to: 'diagnosis' });
    await owner.post(`/api/orders/${o.id}/lines`, { kind: 'part', description: 'Huile', quantity: 4, inventory_item_id: stock.id });
    await owner.post(`/api/orders/${o.id}/invoice`, {});
    const qt = await owner.post(`/api/orders/${o.id}/quotes`, {});
    expect(qt.status).toBe(200);
    const quote = (await owner.get(`/api/orders/${o.id}`)).json.quotes[0];
    await owner.post(`/api/quotes/${quote.id}/decision`, { decisions: Object.fromEntries(quote.lines.map((l: any) => [l.id, 'approved'])), signer_name: 'J', signature: PNG_1x1 });
    expect((await owner.get(`/api/inventory/${stock.id}`)).json.item.quantity).toBe(6);

    const del = await owner.req('DELETE', '/api/samples/clients');
    expect(del.json).toEqual({ removed: 8 });
    const after = (await owner.get('/api/clients')).json;
    const left = Array.isArray(after) ? after : after.items ?? after.clients;
    expect(left.map((c: any) => c.id)).toEqual([real.json.id]);
    expect((await owner.get(`/api/inventory/${stock.id}`)).json.item.quantity).toBe(10);
    expect((await owner.get('/api/invoices')).json).toHaveLength(0);
  });

  it('carga el inventario básico con existencias y no lo duplica', async () => {
    const r = await owner.post('/api/inventory/starter', {});
    expect(r.json.added).toBe(STARTER_INVENTORY.length);
    const list = (await owner.get('/api/inventory')).json;
    const oil = list.find((i: any) => i.starter_key === 'oil-5w30');
    expect(oil).toMatchObject({ quantity: 20, min_quantity: 8, cost_cents: 900, price_cents: 1400, unit: 'l' });
    expect((await owner.post('/api/inventory/starter', {})).json.added).toBe(0);
    const sum = (await owner.get('/api/inventory/summary')).json;
    expect(sum.items).toBe(STARTER_INVENTORY.length);
    expect(sum.value_cents).toBe(STARTER_INVENTORY.reduce((t, s) => t + Math.round(s.qty * Math.round(s.cost * 100)), 0));
  });
});

describe('inventario básico', () => {
  it('empieza sin alertas de stock bajo', async () => {
    await owner.post('/api/inventory/starter', {});
    expect((await owner.get('/api/inventory/summary')).json.low).toBe(0);
  });
});

describe('carga automática en la instalación de prueba', () => {
  it('agrega clientes de ejemplo e inventario una sola vez, aunque ya haya clientes reales', async () => {
    const { runStartupSeeds } = await import('../src/services/samples.js');
    await owner.post('/api/clients', { name: 'Carrito Test', phone: '514 555 0177' });
    expect(await runStartupSeeds()).toEqual({ clients: 8, items: STARTER_INVENTORY.length });
    expect(await runStartupSeeds()).toBeNull();
    expect((await owner.get('/api/settings')).json.google_review_url).toBe('https://www.google.com/search?kgmid=/g/11zkrm26jd');
    // Si el dueño borra los ejemplos, no vuelven a aparecer al reiniciar.
    await owner.req('DELETE', '/api/samples/clients');
    expect(await runStartupSeeds()).toBeNull();
    expect((await owner.get('/api/samples/status')).json).toMatchObject({ clients: 0, starter: STARTER_INVENTORY.length });
  });
});

describe('reseña en Google al entregar', () => {
  it('el mensaje de entrega invita a dejar una reseña solo si hay enlace, en el idioma del cliente', async () => {
    const { enqueue } = await import('../src/lib/notify.js');
    const { pool } = await import('../src/db.js');
    const es = (await owner.post('/api/clients', { name: 'Carlos Ramírez', phone: '514 555 0166', lang: 'es', channels: ['sms'] })).json.id;
    await enqueue({ event: 'delivered', clientId: es, withLink: true });
    let body = (await pool.query(`SELECT body FROM notifications WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`, [es])).rows[0].body;
    expect(body).not.toContain('Google');

    expect((await owner.req('PATCH', '/api/settings', { google_review_url: 'http://no-https.test' })).status).toBe(400);
    expect((await owner.req('PATCH', '/api/settings', { google_review_url: 'https://g.page/r/ELCABO/review' })).status).toBe(200);
    await enqueue({ event: 'delivered', clientId: es, withLink: true });
    body = (await pool.query(`SELECT body FROM notifications WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`, [es])).rows[0].body;
    expect(body).toContain('https://g.page/r/ELCABO/review');
    expect(body).toContain('Mecánico a domicilio en [tu ciudad]');
    expect(body).toContain('con tus palabras');

    const fr = (await owner.post('/api/clients', { name: 'Jean Tremblay', phone: '514 555 0155', lang: 'fr' })).json.id;
    await enqueue({ event: 'delivered', clientId: fr, withLink: true });
    const frBody = (await pool.query(`SELECT body FROM notifications WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`, [fr])).rows[0].body;
    expect(frBody).toContain('Mécanicien à domicile à [votre ville]');
    // Otros mensajes no llevan la invitación
    await enqueue({ event: 'ready', clientId: fr, withLink: true, vars: { total: '10 $' } });
    const ready = (await pool.query(`SELECT body FROM notifications WHERE client_id=$1 ORDER BY created_at DESC LIMIT 1`, [fr])).rows[0].body;
    expect(ready).not.toContain('Google');
  });
});
