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

/** Orden con el cargo de visita (aprobado de entrada) y factura creada ANTES de aprobar la cotización. */
async function earlyInvoice() {
  const c = await owner.post('/api/clients', { name: 'Ana Ruiz', phone: '514 555 3333', lang: 'es' });
  const v = await owner.post('/api/vehicles', { client_id: c.json.id, make: 'Mercedes', model: 'C' });
  const o = await owner.post('/api/orders', { client_id: c.json.id, vehicle_id: v.json.id });
  const id = o.json.id as string;
  await owner.post(`/api/orders/${id}/signatures`, { kind: 'intake', signer_name: 'Ana', image: PNG_1x1 });
  await owner.post(`/api/orders/${id}/status`, { to: 'diagnosis' });
  await owner.post(`/api/orders/${id}/lines`, { kind: 'labor', description: 'Freins', quantity: 1, unit_price_cents: 12000 });
  await owner.post(`/api/orders/${id}/lines`, { kind: 'part', description: 'Plaquettes', quantity: 1, unit_price_cents: 8000, unit_cost_cents: 5000 });
  const inv = await owner.post(`/api/orders/${id}/invoice`, {});
  expect(inv.status).toBe(200);
  const quote = await owner.post(`/api/orders/${id}/quotes`, {});
  expect(quote.status).toBe(200);
  const detail = (await owner.get(`/api/orders/${id}`)).json;
  return { id, invoiceId: inv.json.id as string, first: inv.json.total_cents as number, quote: detail.quotes[0] };
}

describe('la factura se pone al día con lo aprobado', () => {
  it('al aprobar la cotización, la factura ya creada incluye repuestos y mano de obra', async () => {
    const { id, invoiceId, first, quote } = await earlyInvoice();
    const decisions = Object.fromEntries(quote.lines.map((l: any) => [l.id, 'approved']));
    expect((await owner.post(`/api/quotes/${quote.id}/decision`, { decisions })).status).toBe(200);
    const d = (await owner.get(`/api/orders/${id}`)).json;
    const inv = d.invoices.find((i: any) => i.id === invoiceId);
    expect(inv.total_cents).toBeGreaterThan(first);
    expect(inv.subtotal_cents).toBe(d.totals.approved.subtotal_cents);
    expect(inv.total_cents).toBe(d.totals.approved.total_cents);
    expect(inv.kind).toBe('repair');
    const full = (await owner.get(`/api/invoices/${invoiceId}`)).json;
    expect(full.lines.map((l: any) => l.description)).toEqual(expect.arrayContaining(['Freins', 'Plaquettes']));
    const pdf = await owner.get(`/api/invoices/${invoiceId}/pdf?lang=es`);
    expect(pdf.status).toBe(200);
  });

  it('con un pago ya hecho, conserva el pago y queda con saldo', async () => {
    const { id, invoiceId, first, quote } = await earlyInvoice();
    await owner.post(`/api/invoices/${invoiceId}/payments`, { method: 'cash', amount_cents: first });
    const decisions = Object.fromEntries(quote.lines.map((l: any) => [l.id, 'approved']));
    await owner.post(`/api/quotes/${quote.id}/decision`, { decisions });
    const inv = (await owner.get(`/api/orders/${id}`)).json.invoices[0];
    expect(inv.paid_cents).toBe(first);
    expect(inv.status).toBe('partial');
  });

  it('rechazar la cotización no falla aunque ya exista la factura', async () => {
    const { id, invoiceId, first, quote } = await earlyInvoice();
    const decisions = Object.fromEntries(quote.lines.map((l: any) => [l.id, 'rejected']));
    expect((await owner.post(`/api/quotes/${quote.id}/decision`, { decisions })).status).toBe(200);
    const inv = (await owner.get(`/api/orders/${id}`)).json.invoices.find((i: any) => i.id === invoiceId);
    expect(inv.total_cents).toBe(first);
  });

  it('el botón «Actualizar factura» funciona', async () => {
    const { id } = await earlyInvoice();
    const r = await owner.post(`/api/orders/${id}/invoice/sync`, {});
    expect(r.status).toBe(200);
    expect(r.json.changed).toBe(false);
  });
});
