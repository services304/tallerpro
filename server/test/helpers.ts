import type { FastifyInstance } from 'fastify';
import { buildApp, resetRateLimits } from '../src/app.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { LogProvider, processQueue, setProvider } from '../src/lib/notify.js';
import { MemoryStorage, setStorage } from '../src/lib/storage.js';

export const provider = new LogProvider();
export const storage = new MemoryStorage();

export async function freshApp(): Promise<FastifyInstance> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(pool, () => {});
  setProvider(provider);
  setStorage(storage);
  provider.sent.length = 0;
  resetRateLimits();
  return buildApp();
}

export async function flush() {
  while ((await processQueue(100)) > 0) {
    /* vaciar */
  }
}

/** Sale de la cola todo lo pendiente, aunque esté programado para más tarde (horario de silencio). */
export async function flushAll() {
  await pool.query(`UPDATE notifications SET scheduled_for = now() WHERE status='queued'`);
  await flush();
}

export function lastLink(to?: string): string {
  for (let i = provider.sent.length - 1; i >= 0; i--) {
    const m = provider.sent[i]!;
    if (to && m.to !== to) continue;
    const link = /https:\/\/taller\.test\/p\/([A-Za-z0-9_-]+)/.exec(m.body);
    if (link) return link[1]!;
  }
  throw new Error('no se encontró enlace en los mensajes enviados');
}

export class Agent {
  cookie = '';
  constructor(
    private app: FastifyInstance,
    public lang: 'fr' | 'en' | 'es' = 'es',
  ) {}

  async req(method: string, url: string, body?: unknown, extra: Record<string, string> = {}) {
    const res = await this.app.inject({
      method: method as any,
      url,
      payload: body === undefined ? undefined : (body as any),
      headers: {
        'x-requested-with': 'tallerpro',
        'x-lang': this.lang,
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...extra,
      },
    });
    const set = res.headers['set-cookie'];
    if (set) {
      const c = (Array.isArray(set) ? set : [set]).find((x) => x.startsWith('tp_session='));
      if (c) this.cookie = c.split(';')[0]!.endsWith('=') ? '' : c.split(';')[0]!;
    }
    let json: any = null;
    try {
      json = res.json();
    } catch {
      /* no JSON */
    }
    return { status: res.statusCode, json, raw: res };
  }
  get(url: string) {
    return this.req('GET', url);
  }
  post(url: string, body: unknown = {}) {
    return this.req('POST', url, body);
  }
  patch(url: string, body: unknown) {
    return this.req('PATCH', url, body);
  }
  del(url: string) {
    return this.req('DELETE', url);
  }

  async upload(url: string, fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
    const boundary = '----tp' + Math.random().toString(16).slice(2);
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`));
    parts.push(file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
    return this.req('POST', url, Buffer.concat(parts), { 'content-type': `multipart/form-data; boundary=${boundary}` });
  }
}

/** PNG de 1×1 válido (firma). */
export const PNG_1x1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** JPEG mínimo con un bloque EXIF falso que debe desaparecer al subirlo. */
export function fakeJpeg(): Buffer {
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x0d]), Buffer.from('Exif\0\0GPSXX')]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xda, 0x00, 0x02]), Buffer.alloc(64, 7), Buffer.from([0xff, 0xd9])]);
}

export async function setupOwner(app: FastifyInstance, lang: 'fr' | 'en' | 'es' = 'es') {
  const a = new Agent(app, lang);
  const r = await a.post('/api/setup', { name: 'Carlos Dueño', email: 'dueno@taller.test', password: 'clave-segura-123', lang, shopName: 'Mécanique Mobile Test' });
  if (r.status !== 200) throw new Error(`setup falló: ${JSON.stringify(r.json)}`);
  await a.patch('/api/settings', { gst_number: '123456789RT0001', qst_number: '1234567890TQ0001', messaging_mode: 'auto' });
  return a;
}
