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

async function newItem(extra: Record<string, unknown> = {}) {
  const r = await owner.post('/api/inventory', { name: 'Huile 5W-30', category: 'fluids', unit: 'l', quantity: 10, min_quantity: 4, cost_cents: 800, price_cents: 1400, ...extra });
  expect(r.status).toBe(200);
  return r.json;
}

async function orderInDiagnosis() {
  const c = await owner.post('/api/clients', { name: 'Ana Ruiz', phone: '514 555 3333', lang: 'fr' });
  const v = await owner.post('/api/vehicles', { client_id: c.json.id, make: 'Mazda', model: '3' });
  const o = await owner.post('/api/orders', { client_id: c.json.id, vehicle_id: v.json.id });
  await owner.post(`/api/orders/${o.json.id}/signatures`, { kind: 'intake', signer_name: 'Ana', image: PNG_1x1 });
  await owner.post(`/api/orders/${o.json.id}/status`, { to: 'diagnosis' });
  return o.json.id as string;
}

async function approveAll(orderId: string) {
  const qt = await owner.post(`/api/orders/${orderId}/quotes`, {});
  expect(qt.status).toBe(200);
  const quote = (await owner.get(`/api/orders/${orderId}`)).json.quotes[0];
  const r = await owner.post(`/api/quotes/${quote.id}/decision`, { decisions: Object.fromEntries(quote.lines.map((l: any) => [l.id, 'approved'])) });
  expect(r.status).toBe(200);
}

describe('inventario', () => {
  it('crea un artículo con existencia inicial y la registra como movimiento', async () => {
    const it0 = await newItem();
    expect(it0).toMatchObject({ quantity: 10, cost_cents: 800, price_cents: 1400 });
    const d = (await owner.get(`/api/inventory/${it0.id}`)).json;
    expect(d.movements).toHaveLength(1);
    expect(d.movements[0]).toMatchObject({ kind: 'initial', quantity: 10, balance: 10 });
  });

  it('una compra suma y recalcula el costo promedio', async () => {
    const it0 = await newItem();
    const r = await owner.post(`/api/inventory/${it0.id}/movements`, { kind: 'purchase', quantity: 10, unit_cost_cents: 1000 });
    expect(r.json.item).toMatchObject({ quantity: 20, cost_cents: 900 });
  });

  it('el conteo fija la cantidad real y el ajuste resta con motivo', async () => {
    const it0 = await newItem();
    const c = await owner.post(`/api/inventory/${it0.id}/movements`, { kind: 'count', quantity: 7 });
    expect(c.json.movement).toMatchObject({ kind: 'count', quantity: -3, balance: 7 });
    const a = await owner.post(`/api/inventory/${it0.id}/movements`, { kind: 'adjust', quantity: -2, note: 'Bidon renversé' });
    expect(a.json.item.quantity).toBe(5);
    expect((await owner.post(`/api/inventory/${it0.id}/movements`, { kind: 'purchase', quantity: -1 })).status).toBe(400);
  });

  it('stock bajo, resumen y aviso en el tablero', async () => {
    const it0 = await newItem({ quantity: 3 });
    await newItem({ name: 'Filtre à huile', unit: 'unit', quantity: 10, min_quantity: 2, cost_cents: 500 });
    const low = (await owner.get('/api/inventory?low=1')).json;
    expect(low.map((x: any) => x.id)).toEqual([it0.id]);
    const s = (await owner.get('/api/inventory/summary')).json;
    expect(s).toMatchObject({ items: 2, low: 1, value_cents: 3 * 800 + 10 * 500 });
    const dash = (await owner.get('/api/dashboard')).json;
    expect(dash.lowStock.map((x: any) => x.id)).toEqual([it0.id]);
  });

  it('una pieza del inventario en una orden se descuenta al aprobar (una sola vez) y vuelve si se cancela', async () => {
    const it0 = await newItem();
    const id = await orderInDiagnosis();
    const line = await owner.post(`/api/orders/${id}/lines`, { kind: 'part', description: 'Huile 5W-30', quantity: 4.5, inventory_item_id: it0.id });
    expect(line.json).toMatchObject({ unit_price_cents: 1400, unit_cost_cents: 800, inventory_item_id: it0.id });
    // Mientras espera la aprobación, queda «reservada» pero no sale.
    let item = (await owner.get(`/api/inventory/${it0.id}`)).json.item;
    expect(item).toMatchObject({ quantity: 10, reserved: 4.5 });
    await approveAll(id);
    item = (await owner.get(`/api/inventory/${it0.id}`)).json;
    expect(item.item).toMatchObject({ quantity: 5.5, reserved: 0 });
    expect(item.movements[0]).toMatchObject({ kind: 'use', quantity: -4.5, order_id: id });
    // Una segunda cotización (trabajo adicional) no vuelve a descontar la misma pieza.
    await owner.post(`/api/orders/${id}/status`, { to: 'in_repair' });
    await owner.post(`/api/orders/${id}/lines`, { kind: 'labor', description: 'Extra', quantity: 1, unit_price_cents: 5000 });
    await owner.post(`/api/orders/${id}/status`, { to: 'parts_quote' });
    await approveAll(id);
    item = (await owner.get(`/api/inventory/${it0.id}`)).json;
    expect(item.item.quantity).toBe(5.5);
    expect(item.movements.filter((m: any) => m.kind === 'use')).toHaveLength(1);
  });

  it('una orden cancelada antes de aprobar no toca el inventario y libera la reserva', async () => {
    const it0 = await newItem();
    const id = await orderInDiagnosis();
    await owner.post(`/api/orders/${id}/lines`, { kind: 'part', description: 'Huile', quantity: 2, inventory_item_id: it0.id });
    expect((await owner.post(`/api/orders/${id}/status`, { to: 'cancelled', note: 'test' })).status).toBe(200);
    const item = (await owner.get(`/api/inventory/${it0.id}`)).json.item;
    expect(item).toMatchObject({ quantity: 10, reserved: 0 });
  });

  it('precio propio sobre una pieza del inventario y CSV', async () => {
    const it0 = await newItem();
    const id = await orderInDiagnosis();
    const line = await owner.post(`/api/orders/${id}/lines`, { kind: 'part', description: 'Huile', quantity: 1, unit_price_cents: 1200, inventory_item_id: it0.id });
    expect(line.json.unit_price_cents).toBe(1200);
    const csv = await owner.get('/api/inventory.csv');
    expect(csv.status).toBe(200);
    expect(csv.raw.body).toContain('Huile 5W-30');
  });
});
