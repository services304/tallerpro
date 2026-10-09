import { useState } from 'react';
import { post } from '../api';
import { useI18n } from '../i18n';
import { telUrl, useAction } from './ui';

/** Confirmar o rechazar una cita pedida en línea. */
export function BookingActions({ visit, onDone }: { visit: { id: string; client_phone?: string | null }; onDone: () => void }) {
  const { t } = useI18n();
  const { run, busy } = useAction();
  const [sure, setSure] = useState(false);
  return (
    <div className="row">
      <button
        className="btn small primary"
        disabled={busy}
        onClick={async () => {
          if (await run(() => post(`/visits/${visit.id}/confirm`, {}), t('booking.confirmed'))) onDone();
        }}
      >
        {t('booking.confirm')}
      </button>
      {visit.client_phone && (
        <a className="btn small" href={telUrl(visit.client_phone)}>
          {t('booking.call')}
        </a>
      )}
      <button
        className={sure ? 'btn small danger' : 'btn small ghost'}
        disabled={busy}
        onClick={async () => {
          if (!sure) return setSure(true);
          if (await run(() => post(`/visits/${visit.id}/decline`, {}), t('booking.declined'))) onDone();
        }}
      >
        {sure ? t('booking.declineSure') : t('booking.decline')}
      </button>
    </div>
  );
}
