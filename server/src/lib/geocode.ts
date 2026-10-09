/**
 * Dirección a partir de coordenadas GPS (OpenStreetMap / Nominatim, gratis).
 * Se llama desde el servidor (con identificación, como pide su política de uso), con caché y límite.
 * Si falla, la app sigue funcionando: se guardan las coordenadas y el cliente escribe la dirección.
 */
import { config } from '../config.js';
import type { Lang } from './i18n.js';

const cache = new Map<string, string | null>();

export function formatOsmAddress(a: Record<string, string | undefined>): string {
  const street = [a.house_number, a.road ?? a.pedestrian ?? a.footway].filter(Boolean).join(' ');
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? '';
  return [street, city, a.postcode].filter(Boolean).join(', ');
}

export async function reverseGeocode(lat: number, lng: number, lang: Lang, fetcher: typeof fetch = fetch): Promise<string | null> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)},${lang}`;
  if (cache.has(key)) return cache.get(key)!;
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}&accept-language=${lang}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetcher(url, { headers: { 'User-Agent': `TallerPro/${config.version} (${config.publicUrl})` }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = (await r.json()) as { address?: Record<string, string> };
    const addr = j.address ? formatOsmAddress(j.address) : '';
    const out = addr || null;
    if (cache.size > 2000) cache.clear();
    cache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/** Texto de respaldo cuando no hay dirección escrita. */
export function coordsLabel(lat: number, lng: number) {
  return `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
