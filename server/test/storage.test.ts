import type { FastifyInstance } from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config.js';
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

describe('espacio usado', () => {
  it('informa uso, porcentaje y fotos que caben con límite', async () => {
    const before = config.storage.limitMb;
    config.storage.limitMb = 1024;
    try {
      const u = (await owner.get('/api/storage/usage')).json;
      expect(u.limit_bytes).toBe(1024 * 1024 * 1024);
      expect(u.used_bytes).toBeGreaterThan(0);
      expect(u.percent).toBeGreaterThanOrEqual(0);
      expect(u.photos).toBe(0);
      expect(u.photos_left).toBeGreaterThan(1000);
      // Sin pasar del 80 % no hay aviso en «Hoy»
      expect((await owner.get('/api/dashboard')).json.storage).toBeNull();
      // Con un límite muy chico, aparece el aviso
      config.storage.limitMb = 1;
      const d = (await owner.get('/api/dashboard')).json;
      expect(d.storage.percent).toBe(100);
    } finally {
      config.storage.limitMb = before;
    }
  });

  it('sin límite conocido no muestra porcentaje', async () => {
    const before = config.storage.limitMb;
    config.storage.limitMb = 0;
    try {
      const u = (await owner.get('/api/storage/usage')).json;
      expect(u.percent).toBeNull();
      expect(u.photos_left).toBeNull();
    } finally {
      config.storage.limitMb = before;
    }
  });
});
