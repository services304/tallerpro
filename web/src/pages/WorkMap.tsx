import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { placeUrl } from '../components/LocateButton';
import { Check, LoadError, Loading, Seg, Select, useLoad, vehicleName } from '../components/ui';
import { lastFix } from '../geo';
import { useI18n } from '../i18n';

type Pt = { lat: number; lng: number };

/** Orden por cercanía (vecino más próximo) empezando en «from». Suficiente para 2–10 visitas al día. */
export function orderByNearest<T extends Pt>(from: Pt | null, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let cur: Pt | null = from ?? left[0] ?? null;
  while (left.length && cur) {
    let best = 0;
    let bestD = Infinity;
    left.forEach((s, i) => {
      const d = (s.lat - cur!.lat) ** 2 + ((s.lng - cur!.lng) * Math.cos((cur!.lat * Math.PI) / 180)) ** 2;
      if (d < bestD) (bestD = d), (best = i);
    });
    const next = left.splice(best, 1)[0]!;
    out.push(next);
    cur = next;
  }
  return out;
}

function directionsUrl(from: Pt | null, stops: Pt[]) {
  if (!stops.length) return null;
  const ll = (p: Pt) => `${p.lat},${p.lng}`;
  const dest = stops[stops.length - 1]!;
  const way = stops.slice(0, -1).slice(0, 9);
  const params = new URLSearchParams({ api: '1', destination: ll(dest), travelmode: 'driving' });
  if (from) params.set('origin', ll(from));
  if (way.length) params.set('waypoints', way.map(ll).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function dayKey(d: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date(d));
}

/** Mapa de calor del trabajo hecho + zonas principales + planificador de la ruta del día. */
export function WorkMap() {
  const { t, f } = useI18n();
  const [days, setDays] = useState<'30' | '90' | '365' | '3650'>('90');
  const [showVisits, setShowVisits] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const { data, error, loading, reload } = useLoad<any>(`/heatmap?days=${days}`, [days]);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.Layer[]>([]);
  const [heatReady, setHeatReady] = useState(false);

  // Próximos días con visitas para la ruta.
  const upcoming = (data?.upcoming ?? []) as any[];
  const routeDays = useMemo(() => [...new Set(upcoming.map((u) => dayKey(u.scheduled_start)))], [upcoming]);
  const [routeDay, setRouteDay] = useState('');
  useEffect(() => {
    if (routeDays.length && !routeDays.includes(routeDay)) setRouteDay(routeDays[0]!);
  }, [routeDays, routeDay]);
  const from = lastFix();
  const dayStops = upcoming.filter((u) => dayKey(u.scheduled_start) === routeDay);
  const located = orderByNearest(from, dayStops.filter((u) => u.lat != null));
  const unlocated = dayStops.filter((u) => u.lat == null);
  const route = directionsUrl(from, located);

  // Crear el mapa una vez.
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([45.55, -73.65], 10);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(m);
    map.current = m;
    // El complemento del mapa de calor espera «L» global.
    (window as any).L = L;
    import('leaflet.heat').then(() => setHeatReady(true)).catch(() => setHeatReady(false));
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Dibujar capas cuando llegan los datos.
  useEffect(() => {
    const m = map.current;
    if (!m || !data) return;
    layers.current.forEach((l) => m.removeLayer(l));
    layers.current = [];
    const heatPts: [number, number, number][] = [];
    if (showVisits) for (const v of data.visits) heatPts.push([v.lat, v.lng, 1]);
    if (showActivity) for (const a of data.activity) heatPts.push([a.lat, a.lng, 0.35]);
    const heat = (L as any).heatLayer;
    if (heatPts.length && heatReady && heat) {
      layers.current.push(heat(heatPts, { radius: 28, blur: 22, maxZoom: 14, minOpacity: 0.35, gradient: { 0.2: '#3b82f6', 0.45: '#22c55e', 0.7: '#f5b314', 1: '#ef4444' } }).addTo(m));
    } else {
      for (const [lat, lng] of heatPts) layers.current.push(L.circleMarker([lat, lng], { radius: 6, color: '#f5b314', weight: 1, fillOpacity: 0.5 }).addTo(m));
    }
    // Ruta del día: puntos numerados.
    located.forEach((s, i) => {
      const mk = L.circleMarker([s.lat, s.lng], { radius: 11, color: '#111214', weight: 2, fillColor: '#f5b314', fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: true, direction: 'center', className: 'route-num' })
        .addTo(m);
      layers.current.push(mk);
    });
    const all: [number, number][] = [...heatPts.map(([a, b]) => [a, b] as [number, number]), ...located.map((s) => [s.lat, s.lng] as [number, number])];
    if (all.length) m.fitBounds(L.latLngBounds(all).pad(0.2), { maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, showVisits, showActivity, heatReady, routeDay]);

  const total = (data?.visits.length ?? 0) + (data?.activity.length ?? 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('wmap.title')}</h1>
          <p className="muted">{t('wmap.help')}</p>
        </div>
      </div>
      <Seg
        label={t('wmap.period')}
        value={days}
        onChange={setDays}
        options={[
          { value: '30', label: t('wmap.d30') },
          { value: '90', label: t('wmap.d90') },
          { value: '365', label: t('wmap.d365') },
          { value: '3650', label: t('wmap.all') },
        ]}
      />
      <div className="row">
        <Check label={t('wmap.layerVisits', { n: data?.visits.length ?? 0 })} checked={showVisits} onChange={setShowVisits} />
        <Check label={t('wmap.layerActivity', { n: data?.activity.length ?? 0 })} checked={showActivity} onChange={setShowActivity} />
      </div>
      {error && <LoadError error={error} retry={reload} />}
      <div className="workmap" ref={box} role="application" aria-label={t('wmap.title')}>
        {loading && !data && <Loading />}
      </div>
      <div className="heat-legend" aria-hidden="true">
        <span>{t('wmap.less')}</span>
        <i />
        <span>{t('wmap.more')}</span>
      </div>
      {data && total === 0 && <p className="notice">{t('wmap.empty')}</p>}
      {data?.missing > 0 && <p className="muted small">{t('wmap.missing', { n: data.missing })}</p>}

      <section className="section">
        <h2>{t('wmap.routeTitle')}</h2>
        {routeDays.length === 0 ? (
          <p className="muted">{t('wmap.noUpcoming')}</p>
        ) : (
          <>
            <Select label={t('wmap.day')} value={routeDay} onChange={(e) => setRouteDay(e.target.value)}>
              {routeDays.map((d) => (
                <option key={d} value={d}>
                  {f.dayLong(upcoming.find((u) => dayKey(u.scheduled_start) === d)!.scheduled_start)} ({upcoming.filter((u) => dayKey(u.scheduled_start) === d).length})
                </option>
              ))}
            </Select>
            <p className="muted small">{from ? t('wmap.fromHere') : t('wmap.fromFirst')}</p>
            <ol className="list route-list">
              {located.map((s, i) => (
                <li key={s.id} className="item">
                  <div className="item-top">
                    <span>
                      <strong>{i + 1}.</strong> {s.client_name} — {f.time(s.scheduled_start)}
                    </span>
                    <a className="btn small" href={placeUrl(s.address, s.lat, s.lng)} target="_blank" rel="noreferrer">
                      {t('common.openMap')}
                    </a>
                  </div>
                  <span className="muted small">{[vehicleName(s), s.address].filter(Boolean).join(' — ')}</span>
                </li>
              ))}
              {unlocated.map((s) => (
                <li key={s.id} className="item">
                  <span>
                    {s.client_name} — {f.time(s.scheduled_start)}
                  </span>
                  <span className="muted small">
                    {t('wmap.noGps')} {s.address}
                  </span>
                </li>
              ))}
            </ol>
            {located.some((s, i) => i > 0 && new Date(s.scheduled_start) < new Date(located[i - 1]!.scheduled_start)) && <p className="notice small">{t('wmap.orderVsTime')}</p>}
            {route && (
              <a className="btn primary" href={route} target="_blank" rel="noreferrer">
                {t('wmap.openRoute', { n: located.length })}
              </a>
            )}
          </>
        )}
      </section>

      {data?.zones.length > 0 && (
        <section className="section">
          <h2>{t('wmap.zones')}</h2>
          <ul className="list">
            {data.zones.map((z: any, i: number) => (
              <li key={i} className="item">
                <div className="item-top">
                  <span>
                    <strong>{i + 1}.</strong> {t('wmap.near', { a: z.label })}
                  </span>
                  <a className="btn small" href={placeUrl('', z.lat, z.lng)} target="_blank" rel="noreferrer">
                    {t('common.openMap')}
                  </a>
                </div>
                <span className="muted small">
                  {t('wmap.zoneStats', { n: z.count, m: f.money(z.revenue_cents) })}
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('wmap.zonesHelp')}</p>
        </section>
      )}
    </>
  );
}
