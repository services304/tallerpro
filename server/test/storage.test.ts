import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { dbStorage } from '../src/lib/storage.js';
import { freshApp } from './helpers.js';

let app: FastifyInstance;
beforeAll(async () => {
  app = await freshApp();
});
afterAll(async () => {
  await app?.close();
});

describe('fotos guardadas en la base de datos (prueba en Render)', () => {
  it('guarda, lee, reemplaza y borra', async () => {
    const s = dbStorage();
    await s.put('orders/abc/1.jpg', Buffer.from([1, 2, 3]), 'image/jpeg');
    expect(await s.get('orders/abc/1.jpg')).toEqual(Buffer.from([1, 2, 3]));
    await s.put('orders/abc/1.jpg', Buffer.from([9]), 'image/jpeg');
    expect(await s.get('orders/abc/1.jpg')).toEqual(Buffer.from([9]));
    await s.del('orders/abc/1.jpg');
    expect(await s.get('orders/abc/1.jpg')).toBeNull();
    await expect(s.put('../etc/passwd', Buffer.from([1]), 'text/plain')).rejects.toThrow();
  });
});
