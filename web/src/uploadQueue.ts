/**
 * Fotos y videos: se comprimen en el teléfono (sin GPS ni metadatos) y se suben.
 * Si no hay señal en casa del cliente, quedan guardados en el teléfono (IndexedDB) y se suben solos después.
 */
import { api, ApiError } from './api';

export interface PendingUpload {
  id?: number;
  orderId: string;
  fields: Record<string, string>;
  blob: Blob;
  name: string;
  createdAt: number;
}

const DB = 'tallerpro-uploads';
const STORE = 'queue';
const listeners = new Set<(n: number) => void>();
const doneListeners = new Set<(orderId: string) => void>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function count(): Promise<number> {
  try {
    return await withStore('readonly', (s) => s.count());
  } catch {
    return 0;
  }
}

async function notify() {
  const n = await count();
  listeners.forEach((fn) => fn(n));
}

export function onQueueChange(fn: (n: number) => void) {
  listeners.add(fn);
  void count().then(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function onUploaded(fn: (orderId: string) => void) {
  doneListeners.add(fn);
  return () => {
    doneListeners.delete(fn);
  };
}

/** Reduce a 1600 px como máximo y recomprime en JPEG: quita EXIF/GPS y pesa ~300–500 KB. */
export async function compressImage(file: Blob, maxDim = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', quality));
  } catch {
    return file; // el servidor también quita el EXIF de los JPEG
  }
}

async function send(u: PendingUpload) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(u.fields)) fd.append(k, v);
  fd.append('file', u.blob, u.name);
  return api('POST', `/orders/${u.orderId}/photos`, fd);
}

/** Sube ahora; si no hay conexión, deja la foto en cola y devuelve null. */
export async function uploadPhoto(orderId: string, file: File, fields: Record<string, string>) {
  const isImage = file.type.startsWith('image/');
  const blob = isImage ? await compressImage(file) : file;
  const item: PendingUpload = { orderId, fields, blob, name: isImage ? 'photo.jpg' : file.name, createdAt: Date.now() };
  try {
    return await send(item);
  } catch (e) {
    if (e instanceof ApiError && e.status === 0) {
      await withStore('readwrite', (s) => s.add(item));
      await notify();
      return null;
    }
    throw e;
  }
}

let flushing = false;
export async function flushQueue() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    const items = await withStore<PendingUpload[]>('readonly', (s) => s.getAll() as IDBRequest<PendingUpload[]>);
    for (const it of items) {
      try {
        await send(it);
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) break; // sigue sin señal
        // Rechazada por el servidor (tipo o tamaño): no reintentar para siempre.
        console.warn('foto descartada', e);
      }
      await withStore('readwrite', (s) => s.delete(it.id!));
      doneListeners.forEach((fn) => fn(it.orderId));
    }
  } catch (e) {
    console.warn('cola de fotos', e);
  } finally {
    flushing = false;
    await notify();
  }
}

export function startUploadQueue() {
  if (typeof indexedDB === 'undefined') return;
  window.addEventListener('online', () => void flushQueue());
  setInterval(() => void flushQueue(), 60_000);
  void flushQueue();
}
