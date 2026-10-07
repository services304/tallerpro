import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/** Almacenamiento privado de fotos, firmas y PDF. Local en desarrollo, S3 (Montreal) en producción. */
export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  del(key: string): Promise<void>;
}

function safeKey(key: string): string {
  if (!/^[a-z0-9/_\-.]+$/i.test(key) || key.includes('..')) throw new Error(`clave de almacenamiento inválida: ${key}`);
  return key;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  async put(key: string, data: Buffer) {
    const p = path.join(this.root, safeKey(key));
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    try {
      return await readFile(path.join(this.root, safeKey(key)));
    } catch {
      return null;
    }
  }
  async del(key: string) {
    await unlink(path.join(this.root, safeKey(key))).catch(() => {});
  }
}

class S3Storage implements Storage {
  private clientP = import('@aws-sdk/client-s3').then((m) => ({ m, c: new m.S3Client({ region: config.storage.s3Region }) }));
  constructor(private bucket: string) {}
  async put(key: string, data: Buffer, mime: string) {
    const { m, c } = await this.clientP;
    await c.send(
      new m.PutObjectCommand({ Bucket: this.bucket, Key: safeKey(key), Body: data, ContentType: mime, ServerSideEncryption: 'AES256' }),
    );
  }
  async get(key: string) {
    const { m, c } = await this.clientP;
    try {
      const r = await c.send(new m.GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch {
      return null;
    }
  }
  async del(key: string) {
    const { m, c } = await this.clientP;
    await c.send(new m.DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) })).catch(() => {});
  }
}

/** Archivos dentro de PostgreSQL: para pruebas en servicios gratuitos sin disco permanente. */
class DbStorage implements Storage {
  private db = import('../db.js');
  async put(key: string, data: Buffer, mime: string) {
    const { q } = await this.db;
    await q(
      `INSERT INTO stored_files (key, mime, data) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET mime=EXCLUDED.mime, data=EXCLUDED.data`,
      [safeKey(key), mime, data],
    );
  }
  async get(key: string) {
    const { one } = await this.db;
    const r = await one<{ data: Buffer }>('SELECT data FROM stored_files WHERE key=$1', [safeKey(key)]);
    return r?.data ?? null;
  }
  async del(key: string) {
    const { q } = await this.db;
    await q('DELETE FROM stored_files WHERE key=$1', [safeKey(key)]);
  }
}

export let storage: Storage =
  config.storage.driver === 's3'
    ? new S3Storage(config.storage.s3Bucket)
    : config.storage.driver === 'db'
      ? new DbStorage()
      : new LocalStorage(config.storage.dir);

export function dbStorage(): Storage {
  return new DbStorage();
}

export function setStorage(s: Storage) {
  storage = s;
}

export class MemoryStorage implements Storage {
  files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(safeKey(key), data);
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async del(key: string) {
    this.files.delete(key);
  }
}

/** Detecta el tipo real del archivo por sus primeros bytes (no confiar en la extensión). */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
    return 'video/mp4';
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
  return null;
}

/**
 * Quita metadatos EXIF (incluida la ubicación GPS) de un JPEG eliminando los segmentos APP1.
 * La app ya recomprime las fotos en el teléfono; esto es una segunda barrera en el servidor.
 */
export function stripJpegExif(buf: Buffer): Buffer {
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) return buf;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1]!;
    if (marker === 0xda) {
      parts.push(buf.subarray(i)); // inicio de la imagen: el resto se copia tal cual
      return Buffer.concat(parts);
    }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    if (marker !== 0xe1 && marker !== 0xed) parts.push(seg); // APP1 (EXIF/XMP) y APP13 (IPTC) fuera
    i += 2 + len;
  }
  return buf;
}
