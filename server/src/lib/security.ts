import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/** Parámetros actuales de Argon2id. Si se cambian, las contraseñas viejas se migran al iniciar sesión. */
export const ARGON_OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, ARGON_OPTS);
}

export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON_OPTS);
  } catch {
    return true;
  }
}

/** Token aleatorio largo para sesiones y enlaces del cliente (256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Evita que un texto se interprete como fórmula al abrir un CSV en Excel. */
export function csvSafe(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
