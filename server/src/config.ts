import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  for (const p of [path.join(here, '..', 'package.json'), path.join(here, '..', '..', 'package.json')]) {
    try {
      return JSON.parse(readFileSync(p, 'utf8')).version as string;
    } catch {
      /* siguiente */
    }
  }
  return '0.0.0';
}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const env = process.env;

export const config = {
  version: readVersion(),
  env: env.NODE_ENV ?? 'development',
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  // Neon agrega «channel_binding=require»; se quita para máxima compatibilidad (la conexión sigue cifrada con sslmode).
  databaseUrl: (env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/tallerpro?host=/tmp').replace(/[?&]channel_binding=[^&]*/, (m) => (m.startsWith('?') ? '?' : '')).replace(/\?&/, '?').replace(/\?$/, ''),
  // En Render, RENDER_EXTERNAL_URL trae la dirección pública automáticamente.
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || 'http://localhost:5173').replace(/\/$/, ''),
  demo: bool(env.DEMO_MODE, false),
  cookieSecure: bool(env.COOKIE_SECURE, env.NODE_ENV === 'production'),
  sessionIdleHours: Number(env.SESSION_IDLE_HOURS ?? 8),
  portalLinkDays: Number(env.PORTAL_LINK_DAYS ?? 7),
  webDist: env.WEB_DIST ?? path.join(here, '..', '..', 'web', 'dist'),
  storage: {
    driver: (env.STORAGE_DRIVER ?? 'local') as 'local' | 's3' | 'db',
    dir: env.STORAGE_DIR ?? path.join(here, '..', 'storage'),
    s3Bucket: env.S3_BUCKET ?? '',
    s3Region: env.S3_REGION ?? 'ca-central-1',
    /** Límite de la base de datos en MB (Neon gratis: 1 GB). 0 = sin límite conocido. */
    limitMb: Number(env.STORAGE_LIMIT_MB ?? ((env.STORAGE_DRIVER ?? 'local') === 'db' ? 1024 : 0)),
  },
  sms: {
    provider: (env.SMS_PROVIDER ?? 'log') as 'log' | 'twilio',
    twilioSid: env.TWILIO_ACCOUNT_SID ?? '',
    twilioToken: env.TWILIO_AUTH_TOKEN ?? '',
    twilioFrom: env.TWILIO_FROM ?? '',
    twilioWhatsappFrom: env.TWILIO_WHATSAPP_FROM ?? '',
  },
  email: {
    provider: (env.EMAIL_PROVIDER ?? 'log') as 'log' | 'smtp',
    smtpUrl: env.SMTP_URL ?? '',
    from: env.EMAIL_FROM ?? 'TallerPro <no-reply@example.com>',
  },
  workerIntervalMs: Number(env.WORKER_INTERVAL_MS ?? 15000),
  disableWorker: bool(env.DISABLE_WORKER, false),
};

export type Config = typeof config;
