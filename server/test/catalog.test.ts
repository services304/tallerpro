import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SUGGESTED_WORK } from '../src/lib/workCatalog.js';
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

async function orderInDiagnosis(lang: 'fr' | 'en' | 'es' = 'fr') {
  const c = await owner.post('/api/clients', { name: 'Ana Ruiz', phone: '514 555 3333', lang });
  const v = await owner.post('/api/vehicles', { client_id: c.json.id, make: 'Mazda', model: '3' });
  const o = await owner.post('/api/orders', { client_id: c.json.id, vehicle_id: v.json.id });
  await owner.post(`/api/orders/${o.json.id}/signatures`, { kind: 'intake', signer_name: 'Ana', image: PNG_1x1 });
  await owner.post(`/api/orders/${o.json.id}/status`, { to: 'diagnosis' });
  return o.json.id as string;
}

describe('lista de trabajos sugeridos con precio de mercado', () => {
  it('se carga al crear la cuenta, con nombre en FR, EN y ES y precios razonables', async () => {
    const list = (await owner.get('/api/work-types')).json;
    expect(list).toHaveLength(SUGGESTED_WORK.length);
    const pads = list.find((w: any) => w.suggested_key === 'pads-front');
    expect(pads).toMatchObject({ category: 'brakes', mode: 'fixed', price_cents: 12000, est_minutes: 60 });
    expect(pads.names).toEqual({ fr: 'Remplacement des plaquettes de frein avant', en: 'Front brake pad replacement', es: 'Cambio de pastillas de freno delanteras' });
    for (const w of SUGGESTED_WORK) {
      expect(w.names.fr && w.names.en && w.names.es).toBeTruthy();
      // Mano de obra entre 85 y 130 $/h aprox. (precio / horas)
      if (w.mode === 'fixed' && w.minutes >= 30) expect(w.price / (w.minutes / 60)).toBeGreaterThanOrEqual(75);
      if (w.mode === 'fixed' && w.minutes >= 30) expect(w.price / (w.minutes / 60)).toBeLessThanOrEqual(130);
    }
  });

  it('el botón no duplica y respeta los precios que el dueño ya cambió', async () => {
    const pads = (await owner.get('/api/work-types')).json.find((w: any) => w.suggested_key === 'pads-front');
    await owner.patch(`/api/work-types/${pads.id}`, { price_cents: 13500 });
    expect((await owner.post('/api/work-types/suggested', {})).json.added).toBe(0);
    const again = (await owner.get('/api/work-types')).json;
    expect(again).toHaveLength(SUGGESTED_WORK.length);
    expect(again.find((w: any) => w.id === pads.id).price_cents).toBe(13500);
  });

  it('un trabajo propio puede tener nombre en un solo idioma', async () => {
    const r = await owner.post('/api/work-types', { names: { es: 'Lavado de motor' }, category: 'other', mode: 'fixed', price_cents: 6000 });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ name: 'Lavado de motor', names: { es: 'Lavado de motor' } });
    expect((await owner.post('/api/work-types', { names: {}, mode: 'fixed', price_cents: 1 })).status).toBe(400);
  });
});

describe('repuestos con precio manual', () => {
  it('se agrega un repuesto sin proveedor con el precio que pone el dueño, y se puede corregir', async () => {
    const id = await orderInDiagnosis();
    const line = await owner.post(`/api/orders/${id}/lines`, { kind: 'part', description: 'Batterie 12 V', quantity: 1, unit_price_cents: 18999, unit_cost_cents: 14000, part_condition: 'new' });
    expect(line.status).toBe(200);
    expect(line.json).toMatchObject({ kind: 'part', unit_price_cents: 18999, unit_cost_cents: 14000, part_condition: 'new', approval: 'pending' });
    const fixed = await owner.patch(`/api/orders/${id}/lines/${line.json.id}`, { unit_price_cents: 17500, quantity: 2 });
    expect(fixed.json).toMatchObject({ unit_price_cents: 17500, quantity: 2 });
    // Se puede enviar la cotización sin pasar por un proveedor
    const q = await owner.post(`/api/orders/${id}/quotes`, {});
    expect(q.status).toBe(200);
    expect(q.json.total_cents).toBe(35000 + 1750 + 3491);
  });

  it('al elegir una oferta se puede poner el precio al cliente a mano', async () => {
    const id = await orderInDiagnosis();
    const sup = await owner.post('/api/suppliers', { name: 'Pièces Rive-Sud' });
    const part = await owner.post(`/api/orders/${id}/parts`, { description: 'Alternateur' });
    const off = await owner.post(`/api/parts/${part.json.id}/offers`, { supplier_id: sup.json.id, unit_cost_cents: 20000, availability: 'next_day' });
    const chosen = await owner.post(`/api/offers/${off.json.id}/choose`, { unit_price_cents: 27900 });
    expect(chosen.json.unit_price_cents).toBe(27900);
    const lines = (await owner.get(`/api/orders/${id}`)).json.lines;
    expect(lines.find((l: any) => l.id === chosen.json.line_id)).toMatchObject({ unit_price_cents: 27900, unit_cost_cents: 20000 });
  });
});

describe('disponibilidad de la pieza (menú desplegable)', () => {
  it('guarda la opción, pone el plazo solo y no deja elegir una pieza no disponible', async () => {
    const id = await orderInDiagnosis();
    const sup = await owner.post('/api/suppliers', { name: 'Pièces Rive-Sud' });
    const part = await owner.post(`/api/orders/${id}/parts`, { description: 'Démarreur' });
    const a = await owner.post(`/api/parts/${part.json.id}/offers`, { supplier_id: sup.json.id, unit_cost_cents: 15000, availability: 'on_order' });
    expect(a.json).toMatchObject({ availability: 'on_order', lead_days: 7 });
    const b = await owner.post(`/api/parts/${part.json.id}/offers`, { supplier_id: sup.json.id, unit_cost_cents: 9000, availability: 'unavailable' });
    expect(b.json.lead_days).toBeNull();
    const bad = await owner.post(`/api/offers/${b.json.id}/choose`, {});
    expect(bad.status).toBe(409);
    expect(bad.json.error).toBe('parts.unavailable');
    expect((await owner.post(`/api/parts/${part.json.id}/offers`, { supplier_id: sup.json.id, unit_cost_cents: 1, availability: 'tal vez' })).status).toBe(400);
  });
});
