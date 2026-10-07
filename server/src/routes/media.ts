import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { parse, requireUser } from '../app.js';
import { type Db, one, pool } from '../db.js';
import { AppError, notFound } from '../lib/errors.js';
import { sniffMime, storage, stripJpegExif } from '../lib/storage.js';
import { notifyOrder } from '../services/orders.js';

const uuid = z.string().uuid();
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'video/mp4': 'mp4', 'video/webm': 'webm',
};
const PHOTO_MAX = 15 * 1024 * 1024;
const VIDEO_MAX = 60 * 1024 * 1024;

export async function sendStored(reply: FastifyReply, key: string, mime: string) {
  const buf = await storage.get(key);
  if (!buf) throw notFound();
  reply.header('Content-Type', mime).header('Cache-Control', 'private, max-age=3600');
  return reply.send(buf);
}

/** Guarda una firma (PNG en data URL) y devuelve su id. */
export async function saveSignature(
  orderId: string,
  kind: 'intake' | 'quote' | 'delivery',
  signerName: string,
  dataUrl: string,
  meta: { ip?: string; ua?: string },
  db: Db = pool,
): Promise<string> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new AppError(400, 'validation.failed', { fields: 'signature' });
  const buf = Buffer.from(m[1]!, 'base64');
  if (buf.length > 600_000 || sniffMime(buf) !== 'image/png') throw new AppError(400, 'upload.bad_type');
  const key = `orders/${orderId}/sig-${kind}-${randomUUID()}.png`;
  await storage.put(key, buf, 'image/png');
  const r = await one<{ id: string }>(
    `INSERT INTO signatures (order_id, kind, signer_name, storage_key, ip, user_agent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [orderId, kind, signerName, key, meta.ip ?? null, meta.ua?.slice(0, 300) ?? null],
    db,
  );
  return r!.id;
}

export async function mediaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser());

  /** Sube una foto o video corto. La app ya la comprime y quita el GPS; el servidor lo verifica otra vez. */
  app.post('/orders/:id/photos', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const order = await one('SELECT id FROM orders WHERE id=$1', [id]);
    if (!order) throw notFound();
    const file = await req.file();
    if (!file) throw new AppError(400, 'validation.failed', { fields: 'file' });
    const field = (n: string) => {
      const f = (file.fields as any)[n];
      return f && 'value' in f ? String(f.value) : undefined;
    };
    const meta = parse(
      z.object({
        stage: z.enum(['intake', 'diagnosis', 'during', 'after']),
        caption: z.string().max(500).default(''),
        damage_zone: z.string().max(40).optional(),
        shared: z.enum(['true', 'false']).optional(),
      }),
      { stage: field('stage'), caption: field('caption') ?? '', damage_zone: field('damage_zone'), shared: field('shared') },
    );
    let buf = await file.toBuffer();
    const mime = sniffMime(buf);
    if (!mime || !EXT[mime]) throw new AppError(415, 'upload.bad_type');
    const isVideo = mime.startsWith('video/');
    if (buf.length > (isVideo ? VIDEO_MAX : PHOTO_MAX)) throw new AppError(413, 'upload.too_big', { mb: isVideo ? 60 : 15 });
    if (mime === 'image/jpeg') buf = stripJpegExif(buf);
    const key = `orders/${id}/${randomUUID()}.${EXT[mime]}`;
    await storage.put(key, buf, mime);
    // Recepción y «después» se comparten con el cliente por defecto.
    const shared = meta.shared ? meta.shared === 'true' : meta.stage === 'intake' || meta.stage === 'after';
    return one(
      `INSERT INTO photos (order_id, author_id, stage, kind, caption, damage_zone, storage_key, mime, size_bytes, shared)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, stage, kind, caption, damage_zone, mime, size_bytes, shared, created_at`,
      [id, req.user!.id, meta.stage, isVideo ? 'video' : 'photo', meta.caption, meta.damage_zone ?? null, key, mime, buf.length, shared],
    );
  });

  app.patch('/photos/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(z.object({ shared: z.boolean().optional(), caption: z.string().max(500).optional(), stage: z.enum(['intake', 'diagnosis', 'during', 'after']).optional() }), req.body);
    const r = await one(
      'UPDATE photos SET shared=COALESCE($2,shared), caption=COALESCE($3,caption), stage=COALESCE($4,stage) WHERE id=$1 RETURNING id',
      [id, b.shared ?? null, b.caption ?? null, b.stage ?? null],
    );
    if (!r) throw notFound();
    return { ok: true };
  });

  app.delete('/photos/:id', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const r = await one<{ storage_key: string }>('DELETE FROM photos WHERE id=$1 RETURNING storage_key', [id]);
    if (!r) throw notFound();
    await storage.del(r.storage_key);
    return { ok: true };
  });

  app.get('/photos/:id/file', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const p = await one<{ storage_key: string; mime: string }>('SELECT storage_key, mime FROM photos WHERE id=$1', [id]);
    if (!p) throw notFound();
    return sendStored(reply, p.storage_key, p.mime);
  });

  /** Firma del cliente en pantalla. La de recepción dispara el aviso «vehículo recibido» con copia. */
  app.post('/orders/:id/signatures', async (req) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const b = parse(
      z.object({
        kind: z.enum(['intake', 'delivery']),
        signer_name: z.string().trim().min(1).max(160),
        image: z.string().max(900_000),
        notify: z.boolean().default(true),
      }),
      req.body,
    );
    const order = await one('SELECT id FROM orders WHERE id=$1', [id]);
    if (!order) throw notFound();
    const sigId = await saveSignature(id, b.kind, b.signer_name, b.image, { ip: req.ip, ua: req.headers['user-agent'] });
    if (b.kind === 'intake' && b.notify) await notifyOrder(pool, id, 'intake');
    return { id: sigId };
  });

  app.get('/signatures/:id/file', async (req, reply) => {
    const { id } = parse(z.object({ id: uuid }), req.params);
    const s = await one<{ storage_key: string }>('SELECT storage_key FROM signatures WHERE id=$1', [id]);
    if (!s) throw notFound();
    return sendStored(reply, s.storage_key, 'image/png');
  });

}
