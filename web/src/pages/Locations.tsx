import { useState } from 'react';
import { placeUrl } from '../components/LocateButton';
import { Empty, LoadError, Loading, Select, useLoad } from '../components/ui';
import { useI18n, type Key } from '../i18n';

/** Qué acción fue, a partir de la ruta registrada. */
const ACTIONS: [RegExp, string][] = [
  [/^POST \/api\/orders$/, 'orderCreated'],
  [/\/orders\/:id\/status$/, 'status'],
  [/\/orders\/:id\/photos$/, 'photo'],
  [/\/orders\/:id\/signatures$/, 'signature'],
  [/\/orders\/:id\/quotes$/, 'quote'],
  [/\/quotes\/:id\/decision$/, 'decision'],
  [/\/orders\/:id\/invoice/, 'invoice'],
  [/\/invoices\/:id\/payments$/, 'payment'],
  [/\/visits\/:id\/on-the-way$/, 'onTheWay'],
  [/\/visits\/:id\/confirm$/, 'bookingConfirmed'],
  [/^POST \/api\/visits$/, 'visit'],
  [/^PATCH \/api\/visits/, 'visitChanged'],
  [/^POST \/api\/clients$/, 'client'],
  [/\/orders\/:id\/lines/, 'lines'],
  [/\/parts|\/offers/, 'parts'],
  [/\/inventory/, 'inventory'],
  [/\/notifications\/:id\/manual$/, 'message'],
];

function actionKey(kind: string, action: string): string {
  if (kind !== 'action') return kind === 'open' ? 'open' : 'moving';
  return ACTIONS.find(([re]) => re.test(action))?.[1] ?? 'other';
}

function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
}

/** Registro de ubicaciones del personal (solo el dueño). */
export function Locations() {
  const { t, f } = useI18n();
  const [date, setDate] = useState(todayLocal());
  const { data, error, loading, reload } = useLoad<any>(`/locations?date=${date}`, [date]);
  const rows = (data?.rows ?? []) as any[];
  // Recorrido del día en Google Maps (máximo 10 puntos, repartidos).
  const pts = rows.length <= 10 ? rows : Array.from({ length: 10 }, (_, i) => rows[Math.round((i * (rows.length - 1)) / 9)]);
  const route = pts.length >= 2 ? `https://www.google.com/maps/dir/${pts.map((p) => `${p.lat},${p.lng}`).join('/')}` : null;
  const days = (data?.days ?? []) as { day: string; n: number }[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('geo.title')}</h1>
          <p className="muted">{t('geo.help')}</p>
        </div>
      </div>
      <div className="grid2">
        <label className="field">
          <span>{t('geo.day')}</span>
          <input type="date" value={date} max={todayLocal()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {days.length > 0 && (
          <Select label={t('geo.withRecords')} value={days.some((d) => d.day === date) ? date : ''} onChange={(e) => e.target.value && setDate(e.target.value)}>
            <option value="">—</option>
            {days.map((d) => (
              <option key={d.day} value={d.day}>
                {d.day} ({d.n})
              </option>
            ))}
          </Select>
        )}
      </div>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} retry={reload} />}
      {data && rows.length === 0 && <Empty>{t('geo.empty')}</Empty>}
      {route && (
        <a className="btn primary" href={route} target="_blank" rel="noreferrer">
          {t('geo.route', { n: rows.length })}
        </a>
      )}
      {rows.length > 0 && (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="item">
              <div className="item-top">
                <span>
                  <strong>{f.time(r.created_at)}</strong> — {t(`geo.kind.${actionKey(r.kind, r.action)}` as Key)}
                </span>
                <a className="btn small" href={placeUrl('', r.lat, r.lng)} target="_blank" rel="noreferrer">
                  {t('common.openMap')}
                </a>
              </div>
              <span className="muted small">
                {r.user_name}
                {r.accuracy_m != null && ` — ±${r.accuracy_m} m`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
