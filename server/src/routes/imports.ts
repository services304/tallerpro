import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { one, q, tx } from '../db.js';
import { audit } from '../lib/audit.js';
import { csvToContacts, guessMapping, parseCsv, parseVcf, type CsvMapping, type RawContact } from '../lib/contacts.js';
import { AppError, notFound } from '../lib/errors.js';
import { normalizePhone } from '../lib/phone.js';

const emailOk = (e: string | null) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Marca cada contacto: nuevo, duplicado (ya existe o se repite en el archivo) o con problemas. */
async function classify(contacts: RawContact[]) {
  const phones = contacts.map((c) => c.phone).filter(Boolean) as string[];
  const emails = contacts.map((c) => c.email).filter(Boolean) as string[];
  const existing = await q<{ id: string; name: string; phone: string | null; email: string | null }>(
    `SELECT id, name, phone, lower(email) AS email FROM clients WHERE anonymized_at IS NULL AND (phone = ANY($1) OR lower(email) = ANY($2))`,
    [phones, emails],
  );
  const seen = new Set<string>();
  return contacts.map((c, i) => {
    const issues: string[] = [];
    if (!c.name) issues.push('name');
    if (c.phoneRaw && !c.phone) issues.push('phone');
    if (!emailOk(c.email)) issues.push('email');
    if (!c.phone && !c.email) issues.push('contact');
    const match = existing.find((e) => (c.phone && e.phone === c.phone) || (c.email && e.email === c.email));
    const key = c.phone ?? c.email ?? `row${i}`;
    const dupInFile = seen.has(key);
    seen.add(key);
    const status = match ? 'existing' : dupInFile ? 'duplicate' : issues.length ? 'invalid' : 'new';
    return { row: i + 1, ...c, issues, status, existing: match ? { id: match.id, name: match.name } : null };
  });
}

export async function importRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser('admin'));

  /** Vista previa: no guarda nada. Acepta .vcf (contactos del celular / WhatsApp) o .csv. */
  app.post('/imports/preview', async (req) => {
    const file = await req.file();
    if (!file) throw new AppError(400, 'validation.failed', { fields: 'file' });
    const buf = await file.toBuffer();
    if (buf.length > 5 * 1024 * 1024) throw new AppError(413, 'upload.too_big', { mb: 5 });
    const text = buf.toString('utf8');
    const mappingField = (file.fields as any).mapping;
    const isVcf = /BEGIN:VCARD/i.test(text.slice(0, 2000));
    let contacts: RawContact[];
    let headers: string[] = [];
    let mapping: CsvMapping = {};
    if (isVcf) {
      contacts = parseVcf(text);
    } else {
      const rows = parseCsv(text);
      if (rows.length < 2) throw new AppError(400, 'import.empty');
      headers = rows[0]!;
      mapping = mappingField?.value ? JSON.parse(String(mappingField.value)) : guessMapping(headers);
      contacts = csvToContacts(rows.slice(1), mapping);
    }
    if (!contacts.length) throw new AppError(400, 'import.empty');
    const rows = await classify(contacts.slice(0, 5000));
    return {
      filename: file.filename,
      format: isVcf ? 'vcf' : 'csv',
      headers,
      mapping,
      rows,
      summary: {
        total: rows.length,
        new: rows.filter((r) => r.status === 'new').length,
        existing: rows.filter((r) => r.status === 'existing').length,
        duplicate: rows.filter((r) => r.status === 'duplicate').length,
        invalid: rows.filter((r) => r.status === 'invalid').length,
      },
    };
  });

  /** Importa todo o nada, en una sola transacción. Cada cliente queda ligado a su lote. */
  app.post('/imports/commit', async (req) => {
    const b = parse(
      z.object({
        filename: z.string().max(200),
        lang: z.enum(['fr', 'en', 'es']).default('fr'),
        channels: z.array(z.enum(['sms', 'whatsapp', 'email'])).min(1).default(['sms']),
        rows: z
          .array(z.object({ name: z.string().trim().min(1).max(160), phone: z.string().max(40).nullable(), email: z.string().max(200).nullable(), note: z.string().max(1000).default('') }))
          .min(1)
          .max(5000),
      }),
      req.body,
    );
    const result = await tx(async (c) => {
      const batch = await one<{ id: string }>(`INSERT INTO import_batches (kind, filename, user_id) VALUES ('clients',$1,$2) RETURNING id`, [b.filename, req.user!.id], c);
      let created = 0;
      let skipped = 0;
      for (const r of b.rows) {
        const phone = normalizePhone(r.phone);
        const email = r.email && emailOk(r.email) ? r.email.toLowerCase() : null;
        if (!phone && !email) {
          skipped++;
          continue;
        }
        const dup = await one(
          `SELECT 1 FROM clients WHERE anonymized_at IS NULL AND (($1::text IS NOT NULL AND phone=$1) OR ($2::text IS NOT NULL AND lower(email)=$2))`,
          [phone, email],
          c,
        );
        if (dup) {
          skipped++;
          continue;
        }
        const channels = b.channels.filter((ch) => (ch === 'email' ? email : phone));
        await q(
          `INSERT INTO clients (name, phone, email, lang, channels, notes_internal, import_batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r.name, phone, email, b.lang, channels.length ? channels : email ? ['email'] : ['sms'], r.note, batch!.id],
          c,
        );
        created++;
      }
      await q('UPDATE import_batches SET created_count=$2, skipped_count=$3 WHERE id=$1', [batch!.id, created, skipped], c);
      await audit(req, 'import.commit', 'import_batch', batch!.id, null, { created, skipped }, c);
      return { batch_id: batch!.id, created, skipped };
    });
    return result;
  });

  app.get('/imports', async () =>
    q(`SELECT b.*, u.name AS user_name FROM import_batches b LEFT JOIN users u ON u.id=b.user_id ORDER BY created_at DESC LIMIT 50`),
  );

  /** Deshacer (30 días): borra los clientes del lote que todavía no tienen órdenes, visitas ni facturas. */
  app.post('/imports/:id/undo', async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    return tx(async (c) => {
      const b = await one<{ undone_at: Date | null; created_at: Date }>('SELECT undone_at, created_at FROM import_batches WHERE id=$1 FOR UPDATE', [id], c);
      if (!b) throw notFound();
      if (b.undone_at) throw new AppError(409, 'import.undone');
      if (Date.now() - new Date(b.created_at).getTime() > 30 * 24 * 3600_000) throw new AppError(409, 'import.too_old');
      const del = await q(
        `DELETE FROM clients cl WHERE import_batch_id=$1
           AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.client_id=cl.id)
           AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.client_id=cl.id)
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.client_id=cl.id)
         RETURNING id`,
        [id],
        c,
      );
      const kept = await one<{ n: number }>('SELECT count(*)::int AS n FROM clients WHERE import_batch_id=$1', [id], c);
      await q('UPDATE import_batches SET undone_at=now() WHERE id=$1', [id], c);
      await audit(req, 'import.undo', 'import_batch', id, null, { deleted: del.length, kept: kept!.n }, c);
      return { deleted: del.length, kept: kept!.n };
    });
  });
}
