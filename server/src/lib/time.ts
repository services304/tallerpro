import type { Lang } from './i18n.js';

export const TZ = 'America/Toronto'; // misma hora que Montreal

const locales: Record<Lang, string> = { fr: 'fr-CA', en: 'en-CA', es: 'es-US' };

export function localParts(d: Date): { y: number; m: number; day: number; h: number; min: number } {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return { y: g('year'), m: g('month'), day: g('day'), h: g('hour') % 24, min: g('minute') };
}

export function fmtDate(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function fmtShortDate(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function fmtTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: lang === 'en' }).format(d);
}

export function inQuietHours(d: Date, startHour: number, endHour: number): boolean {
  const { h } = localParts(d);
  if (startHour === endHour) return false;
  return startHour > endHour ? h >= startHour || h < endHour : h >= startHour && h < endHour;
}

/** Primer momento fuera del horario de silencio (pasos de 15 min; seguro con cambios de hora). */
export function nextAllowedTime(d: Date, startHour: number, endHour: number): Date {
  let x = new Date(d);
  for (let i = 0; i < 24 * 4 + 1 && inQuietHours(x, startHour, endHour); i++) {
    x = new Date(x.getTime() + 15 * 60_000);
    x.setUTCMinutes(Math.floor(x.getUTCMinutes() / 15) * 15, 0, 0);
  }
  return x;
}

/** Inicio y fin (UTC) del día local que contiene d. */
export function localDayRange(d: Date): { start: Date; end: Date } {
  const { h, min } = localParts(d);
  const start = new Date(d.getTime() - (h * 60 + min) * 60_000);
  start.setUTCSeconds(0, 0);
  // Ajuste fino por si hubo cambio de hora: retroceder/avanzar hasta medianoche local.
  while (localParts(start).h !== 0) start.setTime(start.getTime() - 60 * 60_000);
  const end = new Date(start.getTime() + 24 * 3600_000);
  while (localParts(end).h !== 0) end.setTime(end.getTime() + (localParts(end).h > 12 ? 1 : -1) * 60 * 60_000);
  return { start, end };
}

/** Instante UTC de una hora local (America/Toronto); maneja cambios de hora. */
export function localToUtc(y: number, m: number, day: number, h: number, min = 0): Date {
  let guess = new Date(Date.UTC(y, m - 1, day, h, min));
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess);
    const diff = (Date.UTC(p.y, p.m - 1, p.day, p.h, p.min) - Date.UTC(y, m - 1, day, h, min)) / 60_000;
    if (diff === 0) break;
    guess = new Date(guess.getTime() - diff * 60_000);
  }
  return guess;
}

/** Día de la semana local: 1 = lunes … 7 = domingo. */
export function localWeekday(y: number, m: number, day: number): number {
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return w === 0 ? 7 : w;
}
