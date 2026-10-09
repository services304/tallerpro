/**
 * Ubicación del personal mientras usa la app (taller móvil).
 * - Al abrir la app y al volver a ella: guarda la posición.
 * - Cada 5 minutos mientras está abierta: guarda solo si se movió (el servidor filtra).
 * - Cada acción (crear orden, fotos, pagos…) lleva la última posición en el encabezado X-Geo.
 */
type Fix = { lat: number; lng: number; accuracy: number; at: number };

let last: Fix | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastOpen = 0;
let status: 'off' | 'on' | 'denied' | 'unavailable' = 'off';
const listeners = new Set<(s: typeof status) => void>();

export function geoStatus() {
  return status;
}
export function onGeoStatus(fn: (s: typeof status) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
function setStatus(s: typeof status) {
  status = s;
  listeners.forEach((fn) => fn(s));
}

/** Encabezado para las peticiones: solo si la posición tiene menos de 10 minutos. */
export function geoHeader(): Record<string, string> {
  if (!last || Date.now() - last.at > 10 * 60_000) return {};
  return { 'x-geo': `${last.lat.toFixed(6)},${last.lng.toFixed(6)},${Math.round(last.accuracy)}` };
}

function read(kind: 'open' | 'heartbeat') {
  if (!('geolocation' in navigator)) return setStatus('unavailable');
  navigator.geolocation.getCurrentPosition(
    (p) => {
      last = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() };
      setStatus('on');
      void fetch('/api/me/location', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-requested-with': 'tallerpro' },
        body: JSON.stringify({ lat: last.lat, lng: last.lng, accuracy: last.accuracy, kind }),
      }).catch(() => {});
    },
    (e) => setStatus(e.code === e.PERMISSION_DENIED ? 'denied' : status === 'on' ? 'on' : 'unavailable'),
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
  );
}

function onVisible() {
  if (document.visibilityState !== 'visible') return;
  // Al volver a la app después de un rato cuenta como «abrir».
  if (Date.now() - lastOpen > 15 * 60_000) {
    lastOpen = Date.now();
    read('open');
  } else read('heartbeat');
}

export function startGeoTracking() {
  if (timer) return;
  lastOpen = Date.now();
  read('open');
  timer = setInterval(() => document.visibilityState === 'visible' && read('heartbeat'), 5 * 60_000);
  document.addEventListener('visibilitychange', onVisible);
}

export function stopGeoTracking() {
  if (timer) clearInterval(timer);
  timer = null;
  last = null;
  document.removeEventListener('visibilitychange', onVisible);
  setStatus('off');
}
