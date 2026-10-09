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

async function quotedOrder() {
  const c = (await owner.post('/api/clients', { name: 'Ana Ruiz', phone: '514 555 0142', lang: 'es' })).json;
  const v = (await owner.post('/api/vehicles', { client_id: c.id, make: 'Honda', model: 'Civic' })).json;
  const o = (await owner.post('/api/orders', { client_id: c.id, vehicle_id: v.id })).json;
  await owner.post(`/api/orders/${o.id}/signatures`, { kind: 'intake', signer_name: 'Ana', image: PNG_1x1 });
  await owner.post(`/api/orders/${o.id}/status`, { to: 'diagnosis' });
  await owner.post(`/api/orders/${o.id}/lines`, { kind: 'labor', description: 'Frenos', quantity: 1, unit_price_cents: 12000 });
  await owner.post(`/api/orders/${o.id}/quotes`, {});
  return o.id as string;
}
async function decideAll(id: string, d: 'approved' | 'rejected') {
  const quote = (await owner.get(`/api/orders/${id}`)).json.quotes[0];
  return owner.post(`/api/quotes/${quote.id}/decision`, { decisions: Object.fromEntries(quote.lines.map((l: any) => [l.id, d])) });
}

describe('después de un rechazo se puede volver a cotizar', () => {
  it('los trabajos vuelven a pendiente, se manda otra cotización y la factura de visita pasa a reparación', async () => {
    const id = await quotedOrder();
    expect((await decideAll(id, 'rejected')).status).toBe(200);
    let d = (await owner.get(`/api/orders/${id}`)).json;
    expect(d.order.status).toBe('ready');
    const inspection = d.invoices[0];
    expect(inspection.kind).toBe('inspection');

    const r = await owner.post(`/api/orders/${id}/requote`, {});
    expect(r.status).toBe(200);
    expect(r.json.lines).toBe(1);
    d = (await owner.get(`/api/orders/${id}`)).json;
    expect(d.order.status).toBe('diagnosis');
    const line = d.lines.find((l: any) => l.description === 'Frenos');
    expect(line.approval).toBe('pending');
    // Precio negociado y nueva cotización
    await owner.req('PATCH', `/api/orders/${id}/lines/${line.id}`, { unit_price_cents: 10000 });
    expect((await owner.post(`/api/orders/${id}/quotes`, {})).status).toBe(200);
    expect((await decideAll(id, 'approved')).status).toBe(200);
    d = (await owner.get(`/api/orders/${id}`)).json;
    expect(d.order.status).toBe('approved');
    const inv = d.invoices.find((i: any) => i.id === inspection.id);
    expect(inv.kind).toBe('repair');
    expect(inv.subtotal_cents).toBe(d.totals.approved.subtotal_cents);
  });

  it('no se puede volver a cotizar si no hubo rechazo', async () => {
    const id = await quotedOrder();
    await decideAll(id, 'approved');
    expect((await owner.post(`/api/orders/${id}/requote`, {})).status).toBe(409);
  });
});

describe('modificar la factura a mano', () => {
  it('agregar, cambiar y quitar líneas recalcula total, impuestos y saldo', async () => {
    const id = await quotedOrder();
    await decideAll(id, 'approved');
    const invId = (await owner.post(`/api/orders/${id}/invoice`, {})).json.id;
    const before = (await owner.get(`/api/invoices/${invId}`)).json;
    const t0 = before.invoice?.total_cents ?? before.total_cents;

    const add = await owner.post(`/api/invoices/${invId}/lines`, { kind: 'part', description: 'Plaquettes', quantity: 1, unit_price_cents: 8000 });
    expect(add.status).toBe(200);
    expect(add.json.total_cents).toBeGreaterThan(t0);
    const disc = await owner.post(`/api/invoices/${invId}/lines`, { kind: 'discount', description: 'Rabais client fidèle', quantity: 1, unit_price_cents: 1000 });
    expect(disc.json.total_cents).toBeLessThan(add.json.total_cents);

    const ed = await owner.req('PATCH', `/api/invoices/${invId}/lines/${add.json.line_id}`, { quantity: 2, description: 'Plaquettes (x2)' });
    expect(ed.status).toBe(200);
    const full = (await owner.get(`/api/invoices/${invId}`)).json;
    expect(full.lines.map((l: any) => l.description)).toEqual(expect.arrayContaining(['Plaquettes (x2)', 'Rabais client fidèle']));
    const d = (await owner.get(`/api/orders/${id}`)).json;
    expect(d.invoices[0].total_cents).toBe(d.totals.approved.total_cents);

    expect((await owner.req('DELETE', `/api/invoices/${invId}/lines/${disc.json.line_id}`)).status).toBe(200);
    // Con un pago parcial, el saldo se recalcula
    await owner.post(`/api/invoices/${invId}/payments`, { method: 'cash', amount_cents: 5000 });
    const after = (await owner.get(`/api/orders/${id}`)).json.invoices[0];
    expect(after.status).toBe('partial');
  });

  it('no deja quitar la última línea ni modificar una factura anulada', async () => {
    const id = await quotedOrder();
    await decideAll(id, 'approved');
    const invId = (await owner.post(`/api/orders/${id}/invoice`, {})).json.id;
    const lines = (await owner.get(`/api/orders/${id}`)).json.lines.filter((l: any) => l.approval === 'approved');
    for (const l of lines.slice(1)) await owner.req('DELETE', `/api/invoices/${invId}/lines/${l.id}`);
    expect((await owner.req('DELETE', `/api/invoices/${invId}/lines/${lines[0].id}`)).status).toBe(409);
    await owner.post(`/api/invoices/${invId}/void`, { reason: 'erreur' });
    expect((await owner.post(`/api/invoices/${invId}/lines`, { kind: 'fee', description: 'X', quantity: 1, unit_price_cents: 100 })).status).toBe(409);
  });
});

describe('enviar a aprobar desde la lista de trabajos', () => {
  it('trabajo extra durante la reparación: se envía, se aprueba y lo anterior sigue aprobado', async () => {
    const id = await quotedOrder();
    await decideAll(id, 'approved');
    await owner.post(`/api/orders/${id}/status`, { to: 'in_repair' });
    await owner.post(`/api/orders/${id}/lines`, { kind: 'labor', description: 'Bougies', quantity: 1, unit_price_cents: 11000 });
    const q2 = await owner.post(`/api/orders/${id}/quotes`, {});
    expect(q2.status).toBe(200);
    let d = (await owner.get(`/api/orders/${id}`)).json;
    expect(d.order.status).toBe('quote_sent');
    expect(d.quotes[0].lines.map((l: any) => l.description)).toEqual(['Bougies']);
    await decideAll(id, 'approved');
    d = (await owner.get(`/api/orders/${id}`)).json;
    expect(d.order.status).toBe('approved');
    expect(d.lines.filter((l: any) => l.approval === 'approved').map((l: any) => l.description)).toEqual(expect.arrayContaining(['Frenos', 'Bougies']));
  });

  it('desde la recepción pasa a diagnóstico y envía', async () => {
    const c = (await owner.post('/api/clients', { name: 'Luc', phone: '450 555 0103', lang: 'fr' })).json;
    const v = (await owner.post('/api/vehicles', { client_id: c.id, make: 'Ford', model: 'F-150' })).json;
    const o = (await owner.post('/api/orders', { client_id: c.id, vehicle_id: v.id })).json;
    await owner.post(`/api/orders/${o.id}/signatures`, { kind: 'intake', signer_name: 'Luc', image: PNG_1x1 });
    await owner.post(`/api/orders/${o.id}/lines`, { kind: 'labor', description: 'Freins', quantity: 1, unit_price_cents: 12000 });
    expect((await owner.post(`/api/orders/${o.id}/quotes`, {})).status).toBe(200);
    expect((await owner.get(`/api/orders/${o.id}`)).json.order.status).toBe('quote_sent');
  });
});
