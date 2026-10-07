import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { Agent, fakeJpeg, flushAll, freshApp, lastLink, PNG_1x1, provider, setupOwner, storage } from './helpers.js';

let app: FastifyInstance;
let owner: Agent;

beforeEach(async () => {
  app = await freshApp();
  owner = await setupOwner(app);
});
afterAll(async () => {
  await app?.close();
});

async function newClient(lang: 'fr' | 'en' | 'es' = 'fr', channels = ['sms', 'email']) {
  const r = await owner.post('/api/clients', {
    name: 'Jean Tremblay', phone: '(514) 555-1234', email: 'jean@exemple.ca', address: '123 rue Principale, Longueuil', lang, channels,
  });
  expect(r.status).toBe(200);
  const v = await owner.post('/api/vehicles', { client_id: r.json.id, vin: '1HGCM82633A004352', plate: 'abc123', make: 'Honda', model: 'Accord', year: 2003 });
  expect(v.status).toBe(200);
  return { clientId: r.json.id as string, vehicleId: v.json.id as string };
}

/** Visita agendada + recepción firmada → orden en diagnóstico. */
async function intake(lang: 'fr' | 'en' | 'es' = 'fr') {
  const { clientId, vehicleId } = await newClient(lang);
  const visit = await owner.post('/api/visits', { client_id: clientId, vehicle_id: vehicleId, scheduled_start: new Date(Date.now() + 3 * 86400_000).toISOString() });
  expect(visit.status).toBe(200);
  const order = await owner.post('/api/orders', {
    client_id: clientId, vehicle_id: vehicleId, visit_id: visit.json.id, odometer_in: 182000, fuel_level: 4,
    reason: 'Bruit au freinage', return_parts: true, damages: [{ zone: 'front-left', type: 'scratch' }],
  });
  expect(order.status).toBe(200);
  const id = order.json.id as string;
  // Sin firma no se puede pasar a diagnóstico
  expect((await owner.post(`/api/orders/${id}/status`, { to: 'diagnosis' })).status).toBe(409);
  expect((await owner.post(`/api/orders/${id}/signatures`, { kind: 'intake', signer_name: 'Jean Tremblay', image: PNG_1x1 })).status).toBe(200);
  expect((await owner.post(`/api/orders/${id}/status`, { to: 'diagnosis' })).status).toBe(200);
  return { clientId, vehicleId, orderId: id, number: order.json.number as string };
}

/** Repuesto cotizado con dos proveedores, se elige el más barato, y mano de obra por tipo de trabajo. */
async function quoteWork(orderId: string) {
  const s1 = await owner.post('/api/suppliers', { name: 'Pièces Longueuil', phone: '450-555-0101', email: 'ventes@pieces.test' });
  const s2 = await owner.post('/api/suppliers', { name: 'Recycleur Rive-Sud', phone: '450-555-0202' });
  const wt = await owner.post('/api/work-types', { name: 'Remplacement plaquettes avant', mode: 'fixed', price_cents: 12000 });
  expect((await owner.post(`/api/orders/${orderId}/status`, { to: 'parts_quote' })).status).toBe(200);
  const part = await owner.post(`/api/orders/${orderId}/parts`, { description: 'Plaquettes de frein avant', part_number: 'PF-123', quantity: 1 });
  const ask = await owner.post(`/api/orders/${orderId}/parts/ask`, { supplier_id: s1.json.id, channel: 'email' });
  expect(ask.json.sent).toBe(true);
  expect(ask.json.text).toContain('PF-123');
  expect(ask.json.text).toContain('1HGCM82633A004352');
  // Sin oferta elegida no se puede enviar la cotización
  const blocked = await owner.post(`/api/orders/${orderId}/quotes`, {});
  expect(blocked.status).toBe(409);
  expect(blocked.json.error).toBe('quote.offer_missing');
  const o1 = await owner.post(`/api/parts/${part.json.id}/offers`, { supplier_id: s1.json.id, unit_cost_cents: 6000, lead_days: 1, condition: 'new', channel: 'email' });
  const o2 = await owner.post(`/api/parts/${part.json.id}/offers`, { supplier_id: s2.json.id, unit_cost_cents: 4000, lead_days: 2, condition: 'used', channel: 'phone' });
  expect(o1.status).toBe(200);
  const chosen = await owner.post(`/api/offers/${o2.json.id}/choose`, {});
  expect(chosen.json.unit_price_cents).toBe(5200); // 4000 + 30 %
  // Cambiar de opinión: la línea se actualiza, no se duplica
  await owner.post(`/api/offers/${o1.json.id}/choose`, {});
  const again = await owner.post(`/api/offers/${o2.json.id}/choose`, {});
  expect(again.json.line_id).toBe(chosen.json.line_id);
  const labor = await owner.post(`/api/orders/${orderId}/lines`, { kind: 'labor', description: 'Remplacement plaquettes avant', work_type_id: wt.json.id });
  expect(labor.json.unit_price_cents).toBe(12000);
  return { laborLineId: labor.json.id as string, partLineId: chosen.json.line_id as string };
}

describe('flujo completo de una reparación a domicilio', () => {
  it('visita, recepción, repuestos, cotización aprobada en el portal, factura, pago y cierre', async () => {
    const { orderId, clientId, number } = await intake('fr');
    await flushAll();
    const sms = provider.sent.filter((m) => m.to === '+15145551234');
    expect(sms.some((m) => m.body.includes('visite est confirmée'))).toBe(true);
    expect(sms.some((m) => m.body.includes(number))).toBe(true); // aviso «véhicule reçu»
    expect(provider.sent.some((m) => m.to === 'jean@exemple.ca')).toBe(true);

    // El cargo de visita ya está aprobado en la orden
    let detail = (await owner.get(`/api/orders/${orderId}`)).json;
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({ kind: 'fee', unit_price_cents: 9000, approval: 'approved' });
    expect(detail.order.diagnosis).toContain('front-left');

    // Foto de recepción: se guarda sin EXIF y compartida por defecto
    const photo = await owner.upload(`/api/orders/${orderId}/photos`, { stage: 'intake', caption: 'Avant gauche' }, { name: 'a.jpg', data: fakeJpeg(), type: 'image/jpeg' });
    expect(photo.status).toBe(200);
    expect(photo.json.shared).toBe(true);
    const stored = [...storage.files.values()].find((b) => b[0] === 0xff && b[1] === 0xd8)!;
    expect(stored.includes(Buffer.from('GPSXX'))).toBe(false);
    const hidden = await owner.upload(`/api/orders/${orderId}/photos`, { stage: 'diagnosis' }, { name: 'b.jpg', data: fakeJpeg(), type: 'image/jpeg' });
    expect(hidden.json.shared).toBe(false);
    const bad = await owner.upload(`/api/orders/${orderId}/photos`, { stage: 'intake' }, { name: 'x.jpg', data: Buffer.from('<script>alert(1)</script>xxxxxxxx'), type: 'image/jpeg' });
    expect(bad.status).toBe(415);

    await quoteWork(orderId);
    const quote = await owner.post(`/api/orders/${orderId}/quotes`, {});
    expect(quote.status).toBe(200);
    // Cotización = pieza 52 $ + mano de obra 120 $ = 172 $ + TPS 8,60 $ + TVQ 17,16 $
    expect(quote.json.total_cents).toBe(17200 + 860 + 1716);
    await flushAll();
    const token = lastLink('+15145551234');

    // Portal del cliente: ve su orden, la foto compartida (no la otra) y la cotización
    const client = new Agent(app, 'fr');
    client.cookie = '';
    const portal = await client.get(`/api/portal/${token}`);
    expect(portal.status).toBe(200);
    const po = portal.json.orders[0];
    expect(po.number).toBe(number);
    expect(po.photos).toHaveLength(1);
    expect((await client.get(`/api/portal/${token}/photos/${photo.json.id}`)).status).toBe(200);
    expect((await client.get(`/api/portal/${token}/photos/${hidden.json.id}`)).status).toBe(404);
    const q = po.quotes[0];
    expect(q.status).toBe('sent');
    expect(q.lines).toHaveLength(2);
    // No ve las notas internas ni el costo de las piezas
    expect(JSON.stringify(portal.json)).not.toContain('unit_cost_cents');
    expect(JSON.stringify(portal.json)).not.toContain('notes_internal');

    // Debe decidir cada línea
    const partial = await client.post(`/api/portal/${token}/quotes/${q.id}/decision`, { decisions: { [q.lines[0].id]: 'approved' }, signer_name: 'Jean', signature: PNG_1x1 });
    expect(partial.status).toBe(400);
    const ok = await client.post(`/api/portal/${token}/quotes/${q.id}/decision`, {
      decisions: Object.fromEntries(q.lines.map((l: any) => [l.id, 'approved'])), signer_name: 'Jean Tremblay', signature: PNG_1x1,
    });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('approved');
    const twice = await client.post(`/api/portal/${token}/quotes/${q.id}/decision`, {
      decisions: Object.fromEntries(q.lines.map((l: any) => [l.id, 'approved'])), signer_name: 'Jean Tremblay', signature: PNG_1x1,
    });
    expect(twice.status).toBe(409);
    const decided = (await pool.query('SELECT decided_by, decided_ip, signature_id FROM quotes WHERE id=$1', [q.id])).rows[0];
    expect(decided.decided_by).toBe('client');
    expect(decided.signature_id).toBeTruthy();

    // Repuesto aprobado → pedido al proveedor
    detail = (await owner.get(`/api/orders/${orderId}`)).json;
    expect(detail.order.status).toBe('approved');
    expect(detail.parts[0].status).toBe('ordered');

    for (const to of ['in_repair', 'quality_check', 'ready']) expect((await owner.post(`/api/orders/${orderId}/status`, { to })).status).toBe(200);

    // Factura: visita 90 $ + 172 $ = 262 $ + impuestos
    const inv = await owner.post(`/api/orders/${orderId}/invoice`, {});
    expect(inv.status).toBe(200);
    expect(inv.json.number).toBe(1001);
    expect(inv.json.total_cents).toBe(26200 + 1310 + 2613);
    expect((await owner.post(`/api/orders/${orderId}/invoice`, {})).status).toBe(409);
    const pdf = await owner.get(`/api/invoices/${inv.json.id}/pdf`);
    expect(pdf.raw.headers['content-type']).toBe('application/pdf');
    expect(pdf.raw.rawPayload.subarray(0, 4).toString()).toBe('%PDF');

    // Pago en dos partes; no se puede pagar de más
    expect((await owner.post(`/api/invoices/${inv.json.id}/payments`, { method: 'interac', amount_cents: 10000 })).json.balance_cents).toBe(20123);
    const over = await owner.post(`/api/invoices/${inv.json.id}/payments`, { method: 'cash', amount_cents: 99999 });
    expect(over.status).toBe(400);
    expect(over.json.message).toContain('201,23');
    await owner.post(`/api/orders/${orderId}/status`, { to: 'delivered' });
    expect((await owner.get(`/api/orders/${orderId}`)).json.order.status).toBe('delivered');
    await owner.post(`/api/invoices/${inv.json.id}/payments`, { method: 'card', amount_cents: 20123 });
    // Entregado + pagado → cerrado automáticamente
    expect((await owner.get(`/api/orders/${orderId}`)).json.order.status).toBe('closed');

    // Dossier del cliente
    const dossier = (await owner.get(`/api/clients/${clientId}`)).json;
    expect(dossier.orders).toHaveLength(1);
    expect(dossier.invoices[0].status).toBe('paid');
    expect(dossier.vehicles[0].last_odometer).toBe(182000);
  });

  it('cotización rechazada → factura de revisión automática y orden lista para recoger', async () => {
    const { orderId } = await intake('es');
    await quoteWork(orderId);
    const quote = await owner.post(`/api/orders/${orderId}/quotes`, {});
    await flushAll();
    const token = lastLink('+15145551234');
    const client = new Agent(app, 'es');
    const q = (await client.get(`/api/portal/${token}`)).json.orders[0].quotes[0];
    expect(q.id).toBe(quote.json.id);
    const r = await client.post(`/api/portal/${token}/quotes/${q.id}/decision`, {
      decisions: Object.fromEntries(q.lines.map((l: any) => [l.id, 'rejected'])), signer_name: 'Jean', signature: PNG_1x1,
    });
    expect(r.json.status).toBe('rejected');
    const d = (await owner.get(`/api/orders/${orderId}`)).json;
    expect(d.order.status).toBe('ready');
    expect(d.history.map((h: any) => h.to_status)).toEqual(['received', 'diagnosis', 'parts_quote', 'quote_sent', 'rejected', 'ready']);
    expect(d.invoices).toHaveLength(1);
    expect(d.invoices[0]).toMatchObject({ kind: 'inspection', subtotal_cents: 9000, total_cents: 10348 });
    // Las líneas rechazadas no se facturan; el repuesto no se pide
    expect(d.parts[0].status).toBe('chosen');
    await flushAll();
    expect(provider.sent.some((m) => m.body.includes('rechazaste los trabajos') && m.body.includes('103,48'))).toBe(true);
  });

  it('trabajo adicional rechazado no cancela lo ya aprobado', async () => {
    const { orderId } = await intake();
    const l = await owner.post(`/api/orders/${orderId}/lines`, { kind: 'labor', description: 'Diagnostic électrique', quantity: 1, unit_price_cents: 8000 });
    expect(l.status).toBe(200);
    const q1 = await owner.post(`/api/orders/${orderId}/quotes`, {});
    const q1d = (await owner.get(`/api/orders/${orderId}`)).json.quotes[0];
    await owner.post(`/api/quotes/${q1.json.id}/decision`, { decisions: { [q1d.lines[0].id]: 'approved' } });
    await owner.post(`/api/orders/${orderId}/status`, { to: 'in_repair' });
    // Encuentra trabajo adicional → vuelve a cotizar repuestos
    await owner.post(`/api/orders/${orderId}/status`, { to: 'parts_quote' });
    await owner.post(`/api/orders/${orderId}/lines`, { kind: 'labor', description: 'Courroie', quantity: 1, unit_price_cents: 15000 });
    const q2 = await owner.post(`/api/orders/${orderId}/quotes`, {});
    expect(q2.json.version).toBe(2);
    const q2d = (await owner.get(`/api/orders/${orderId}`)).json.quotes.find((x: any) => x.version === 2);
    const r = await owner.post(`/api/quotes/${q2.json.id}/decision`, { decisions: { [q2d.lines[0].id]: 'rejected' } });
    expect(r.json.status).toBe('rejected');
    const d = (await owner.get(`/api/orders/${orderId}`)).json;
    expect(d.order.status).toBe('approved');
    expect(d.invoices).toHaveLength(0);
    expect(d.totals.approved.subtotal_cents).toBe(9000 + 8000);
  });

  it('no permite cambiar líneas aprobadas ni saltar estados', async () => {
    const { orderId } = await intake();
    const d = (await owner.get(`/api/orders/${orderId}`)).json;
    const feeLine = d.lines[0];
    expect((await owner.patch(`/api/orders/${orderId}/lines/${feeLine.id}`, { unit_price_cents: 1 })).status).toBe(409);
    expect((await owner.del(`/api/orders/${orderId}/lines/${feeLine.id}`)).status).toBe(404);
    const jump = await owner.post(`/api/orders/${orderId}/status`, { to: 'ready' });
    expect(jump.status).toBe(409);
    expect(jump.json.error).toBe('order.bad_transition');
    expect((await owner.post(`/api/orders/${orderId}/status`, { to: 'approved' })).status).toBe(409);
  });

  it('anular una factura crea una nota de crédito y libera la orden para facturar de nuevo', async () => {
    const { orderId } = await intake();
    const inv = await owner.post(`/api/orders/${orderId}/invoice`, {});
    expect((await owner.post(`/api/invoices/${inv.json.id}/void`, { reason: 'Erreur de montant' })).status).toBe(200);
    const again = await owner.post(`/api/orders/${orderId}/invoice`, {});
    expect(again.json.number).toBe(inv.json.number + 1);
    const credits = (await owner.get(`/api/invoices/${inv.json.id}`)).json.credits;
    expect(credits[0].amount_cents).toBe(inv.json.total_cents);
    const audit = await pool.query(`SELECT action FROM audit_log WHERE action='invoice.void'`);
    expect(audit.rowCount).toBe(1);
  });
});

describe('agenda y avisos', () => {
  it('voy en camino, recordatorio del día antes y horario de silencio', async () => {
    const { clientId } = await newClient('en', ['sms']);
    const soon = await owner.post('/api/visits', { client_id: clientId, scheduled_start: new Date(Date.now() + 20 * 3600_000).toISOString(), notify: false });
    await pool.query(`UPDATE visits SET created_at = now() - interval '2 hours'`);
    const { sendVisitReminders } = await import('../src/routes/visits.js');
    expect(await sendVisitReminders()).toBe(1);
    expect(await sendVisitReminders()).toBe(0);
    const otw = await owner.post(`/api/visits/${soon.json.id}/on-the-way`, { eta_minutes: 25 });
    expect(otw.json.sent).toBe(1);
    await flushAll();
    expect(provider.sent.some((m) => m.body.startsWith("Hi Jean, we're on our way"))).toBe(true);
    expect(provider.sent.some((m) => m.body.includes('reminder'))).toBe(true);
  });

  it('respeta la baja por SMS (STOP)', async () => {
    const { clientId } = await newClient('fr', ['sms']);
    const r = await app.inject({
      method: 'POST', url: '/api/webhooks/twilio', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'From=%2B15145551234&Body=ARR%C3%8AT',
    });
    expect(r.statusCode).toBe(200);
    await owner.post('/api/visits', { client_id: clientId, scheduled_start: new Date(Date.now() + 86400_000 * 4).toISOString() });
    const n = await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE client_id=$1`, [clientId]);
    expect(n.rows[0].n).toBe(0);
  });

  it('si un canal falla 3 veces, avisa por el otro canal', async () => {
    const { clientId } = await newClient('fr', ['whatsapp']);
    const { setProvider } = await import('../src/lib/notify.js');
    const failing = { send: async (ch: string, to: string, s: string, b: string) => {
      if (ch === 'whatsapp') throw new Error('Template not approved');
      return provider.send(ch as any, to, s, b);
    } };
    setProvider(failing as any);
    await owner.post('/api/visits', { client_id: clientId, scheduled_start: new Date(Date.now() + 86400_000 * 4).toISOString() });
    for (let i = 0; i < 4; i++) await flushAll();
    const rows = (await pool.query(`SELECT channel, status FROM notifications WHERE client_id=$1 ORDER BY created_at`, [clientId])).rows;
    expect(rows).toEqual([{ channel: 'whatsapp', status: 'failed' }, { channel: 'email', status: 'sent' }]);
    setProvider(provider);
  });
});

describe('portal del cliente', () => {
  it('pide un código con su teléfono, entra y cambia sus preferencias', async () => {
    await newClient('fr', ['sms']);
    const c = new Agent(app, 'fr');
    const r1 = await c.post('/api/portal/request-code', { contact: '514 555 1234' });
    const r2 = await c.post('/api/portal/request-code', { contact: '514 999 9999' });
    expect(r1.json).toEqual(r2.json);
    await flushAll();
    const code = /(\d{6})/.exec(provider.sent.at(-1)!.body)![1]!;
    expect((await c.post('/api/portal/verify-code', { contact: '5145551234', code: code === '000000' ? '111111' : '000000' })).status).toBe(400);
    const v = await c.post('/api/portal/verify-code', { contact: '5145551234', code });
    expect(v.status).toBe(200);
    expect((await c.post('/api/portal/verify-code', { contact: '5145551234', code })).status).toBe(400);
    const p = await c.patch(`/api/portal/${v.json.token}/preferences`, { lang: 'es', channels: ['sms', 'email'], consent_maintenance: true });
    expect(p.status).toBe(200);
    const me = (await c.get(`/api/portal/${v.json.token}`)).json.client;
    expect(me).toMatchObject({ lang: 'es', channels: ['sms', 'email'], consent_maintenance: true });
    expect((await c.get('/api/portal/token-que-no-existe-xxxxxxxxxxxx')).status).toBe(401);
  });
});

describe('clientes, importación y privacidad', () => {
  it('avisa de duplicados y fusiona clientes', async () => {
    const { clientId } = await newClient();
    const dup = await owner.post('/api/clients', { name: 'J. Tremblay', phone: '514-555-1234' });
    expect(dup.status).toBe(409);
    expect(dup.json.message).toContain('Jean Tremblay');
    const forced = await owner.post('/api/clients', { name: 'J. Tremblay', phone: '514-555-1234', force: true });
    expect((await owner.post(`/api/clients/${clientId}/merge`, { sourceId: forced.json.id })).status).toBe(200);
    expect((await owner.get(`/api/clients/${forced.json.id}`)).status).toBe(404);
  });

  it('importa contactos de WhatsApp (.vcf), descarta duplicados y se puede deshacer', async () => {
    await newClient();
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Marie Côté', 'TEL;TYPE=CELL:438-555-0001', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Jean T (ya existe)', 'TEL:514-555-1234', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Marie bis', 'TEL;TYPE=CELL:438 555 0001', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:=HYPERLINK("x")', 'TEL;TYPE=CELL:438-555-0002', 'END:VCARD',
    ].join('\n');
    const prev = await owner.upload('/api/imports/preview', {}, { name: 'contacts.vcf', data: Buffer.from(vcf), type: 'text/vcard' });
    expect(prev.status).toBe(200);
    expect(prev.json.summary).toMatchObject({ total: 4, new: 2, existing: 1, duplicate: 1 });
    const rows = prev.json.rows.filter((r: any) => r.status === 'new');
    const commit = await owner.post('/api/imports/commit', { filename: 'contacts.vcf', rows: rows.map((r: any) => ({ name: r.name, phone: r.phone, email: r.email })) });
    expect(commit.json).toMatchObject({ created: 2, skipped: 0 });
    // Exportar a CSV neutraliza fórmulas
    const csv = await owner.get('/api/clients-export.csv');
    expect(csv.raw.payload).toContain(`"'=HYPERLINK(""x"")"`);
    const undo = await owner.post(`/api/imports/${commit.json.batch_id}/undo`, {});
    expect(undo.json).toEqual({ deleted: 2, kept: 0 });
    expect((await owner.post(`/api/imports/${commit.json.batch_id}/undo`, {})).status).toBe(409);
  });

  it('exporta los datos de un cliente y lo anonimiza conservando las facturas', async () => {
    const { orderId, clientId } = await intake();
    await owner.upload(`/api/orders/${orderId}/photos`, { stage: 'intake' }, { name: 'a.jpg', data: fakeJpeg(), type: 'image/jpeg' });
    await owner.post(`/api/orders/${orderId}/invoice`, {});
    const exp = await owner.get(`/api/clients/${clientId}/export`);
    expect(exp.json.client.email).toBe('jean@exemple.ca');
    expect(exp.json.invoices).toHaveLength(1);
    expect((await owner.post(`/api/clients/${clientId}/anonymize`, {})).status).toBe(200);
    const c = (await pool.query('SELECT name, phone, email, anonymized_at FROM clients WHERE id=$1', [clientId])).rows[0];
    expect(c).toMatchObject({ name: 'Jean Tremblay', phone: null, email: null });
    expect(c.anonymized_at).toBeTruthy();
    expect((await pool.query('SELECT count(*)::int AS n FROM photos')).rows[0].n).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM invoices')).rows[0].n).toBe(1);
  });
});

describe.each(['es', 'en', 'fr'] as const)('mensajes de error traducidos (%s)', (lang) => {
  it('responde en el idioma pedido', async () => {
    owner.lang = lang;
    const r = await owner.post('/api/vehicles', { client_id: '00000000-0000-0000-0000-000000000000', vin: 'XYZ' });
    expect(r.status).toBe(400);
    expect(r.json.message).toBe(
      { es: 'El VIN no es válido (17 caracteres, sin I, O ni Q).', en: 'The VIN is not valid (17 characters, no I, O or Q).', fr: "Le NIV n'est pas valide (17 caractères, sans I, O ni Q)." }[lang],
    );
  });
});
