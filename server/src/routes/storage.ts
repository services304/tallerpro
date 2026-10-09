import type { FastifyInstance } from 'fastify';
import { requireUser } from '../app.js';
import { config } from '../config.js';
import { one } from '../db.js';

/** Espacio usado: base de datos completa (en Neon las fotos van dentro) y cuánto es de fotos y videos. */
export async function storageUsage() {
  const r = await one<{ db_bytes: number; photos: number; videos: number; photo_bytes: number; video_bytes: number }>(
    `SELECT pg_database_size(current_database())::bigint AS db_bytes,
            count(*) FILTER (WHERE kind='photo')::int AS photos,
            count(*) FILTER (WHERE kind='video')::int AS videos,
            COALESCE(sum(size_bytes) FILTER (WHERE kind='photo'),0)::bigint AS photo_bytes,
            COALESCE(sum(size_bytes) FILTER (WHERE kind='video'),0)::bigint AS video_bytes
       FROM photos`,
  );
  const limit = config.storage.limitMb * 1024 * 1024;
  const used = config.storage.driver === 'db' ? r!.db_bytes : r!.db_bytes + r!.photo_bytes + r!.video_bytes;
  const avgPhoto = r!.photos > 0 ? Math.round(r!.photo_bytes / r!.photos) : 300 * 1024;
  return {
    used_bytes: used,
    limit_bytes: limit || null,
    percent: limit ? Math.min(100, Math.round((used / limit) * 1000) / 10) : null,
    photos: r!.photos,
    videos: r!.videos,
    photo_bytes: r!.photo_bytes,
    video_bytes: r!.video_bytes,
    avg_photo_bytes: avgPhoto,
    photos_left: limit ? Math.max(0, Math.floor((limit - used) / avgPhoto)) : null,
  };
}

export async function storageRoutes(app: FastifyInstance) {
  app.get('/storage/usage', { preHandler: requireUser() }, async () => storageUsage());
}
