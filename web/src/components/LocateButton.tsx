import { useState } from 'react';
import { get } from '../api';
import { useI18n } from '../i18n';
import { IconMap } from './icons';

export type Located = { lat: number; lng: number; accuracy: number; address: string | null };

/**
 * «Usar mi ubicación»: pide el GPS del teléfono (el navegador pregunta el permiso)
 * y propone la dirección. Se puede corregir a mano (número de apartamento, entrada, etc.).
 */
export function LocateButton({ onLocated, value }: { onLocated: (l: Located | null) => void; value?: Located | null }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'denied' | 'error'>('idle');

  function locate() {
    if (!('geolocation' in navigator)) return setState('error');
    setState('busy');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        let address: string | null = null;
        try {
          address = (await get<{ address: string | null }>(`/public/geocode/reverse?lat=${lat}&lng=${lng}&lang=${lang}`)).address;
        } catch {
          /* sin dirección: quedan las coordenadas */
        }
        onLocated({ lat, lng, accuracy: Math.round(accuracy), address });
        setState('idle');
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'error'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <button type="button" className={value ? 'btn' : 'btn primary'} disabled={state === 'busy'} onClick={locate}>
        <IconMap /> {state === 'busy' ? t('loc.searching') : value ? t('loc.again') : t('loc.use')}
      </button>
      {value && (
        <p className="ok-text small">
          {t('loc.saved', { m: value.accuracy })}{' '}
          <a href={placeUrl('', value.lat, value.lng)} target="_blank" rel="noreferrer">
            {t('loc.see')}
          </a>{' '}
          ·{' '}
          <button type="button" className="linklike" onClick={() => onLocated(null)}>
            {t('loc.remove')}
          </button>
        </p>
      )}
      {state === 'denied' && <p className="notice small">{t('loc.denied')}</p>}
      {state === 'error' && <p className="notice small">{t('loc.error')}</p>}
    </div>
  );
}

/** Enlace a Google Maps: con coordenadas GPS si las hay (más preciso), si no con la dirección. */
export function placeUrl(address: string, lat?: number | null, lng?: number | null) {
  const q = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
