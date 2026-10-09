import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { geocodePendingVisits, zonesOf } from '../src/routes/heatmap.js';
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

async function visit(name: string, phone: string, when: Date, lat?: number, lng?: number, address = '1 rue Test, Laval') {
  const c = (await owner.post('/api/clients', { name, phone })).json;
  const v = (await owner.post('/api/visits', { client_id: c.id, scheduled_start: when.toISOString(), address, lat, lng, notify: false })).json;
  return v.id as string;
}

describe('mapa de trabajo', () => {
  it('agrupa zonas y cuenta visitas e ingresos', () => {
    const z = zonesOf([
      { lat: 45.5, lng: -73.56, revenue: 10000, address: 'A' },
      { lat: 45.501, lng: -73.561, revenue: 5000, address: 'B' },
      { lat: 45.6, lng: -73.7, revenue: 0, address: 'C' },
    ]);
    expect(z[0]).toMatchObject({ count: 2, revenue_cents: 15000, label: 'A' });
    expect(z).toHaveLength(2);
  });

  it('devuelve puntos de trabajo, actividad, próximas visitas y las que faltan ubicar', async () => {
    const past = new Date(Date.now() - 3 * 86400_000);
    const v1 = await visit('A', '514 555 0181', past, 45.5, -73.56);
    await pool.query(`UPDATE visits SET status='done' WHERE id=$1`, [v1]);
    await visit('B', '514 555 0182', past); // sin GPS
    await visit('C', '514 555 0183', new Date(Date.now() + 2 * 86400_000), 45.55, -73.6);
    await owner.req('POST', '/api/clients', { name: 'D', phone: '514 555 0184' }, { 'x-geo': '45.52,-73.58,10' });
    const h = (await owner.get('/api/heatmap?days=30')).json;
    expect(h.visits).toEqual([{ lat: 45.5, lng: -73.56, revenue_cents: 0 }]);
    expect(h.activity).toEqual([{ lat: 45.52, lng: -73.58 }]);
    expect(h.upcoming.map((u: any) => u.client_name)).toContain('C');
    expect(h.missing).toBe(1);
    expect(h.zones[0].count).toBe(1);
  });

  it('ubica las visitas que solo tienen dirección (una sola vez)', async () => {
    const id = await visit('B', '514 555 0185', new Date(Date.now() - 86400_000), undefined, undefined, '1200 rue Sainte-Catherine, Montréal');
    let calls = 0;
    const fake = (async () => {
      calls++;
      return new Response(JSON.stringify([{ lat: '45.5', lon: '-73.57' }]));
    }) as any;
    expect(await geocodePendingVisits(pool, 5, fake)).toBe(1);
    const r = await pool.query('SELECT lat, lng FROM visits WHERE id=$1', [id]);
    expect(r.rows[0]).toEqual({ lat: 45.5, lng: -73.57 });
    expect(await geocodePendingVisits(pool, 5, fake)).toBe(0);
    expect(calls).toBe(1);
  });
});
