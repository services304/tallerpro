import { Link } from 'react-router';
import { post } from '../api';
import { LoadError, Loading, Status, useAction, useLoad } from '../components/ui';
import { useI18n, type Key } from '../i18n';
import { useSession } from '../session';

export function Notifications() {
  const { t, f } = useI18n();
  const { user } = useSession();
  const { data, error, loading, reload } = useLoad<any[]>('/notifications');
  const stats = useLoad<any[]>(user?.role === 'admin' ? '/notifications/stats' : null);
  const { run } = useAction();
  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  const month = new Map<string, number>();
  for (const s of stats.data ?? []) if (s.status !== 'skipped') month.set(s.channel, (month.get(s.channel) ?? 0) + s.n);

  return (
    <>
      <h1>{t('notifications.title')}</h1>
      {month.size > 0 && (
        <div className="figures">
          {(['sms', 'whatsapp', 'email'] as const).map((c) => (
            <div key={c}>
              <strong>{month.get(c) ?? 0}</strong>
              <span>
                {t(`clients.channel.${c}` as Key)} — {t('notifications.month')}
              </span>
            </div>
          ))}
        </div>
      )}
      <ul className="list">
        {data!.map((n) => (
          <li key={n.id} className="item">
            <div className="item-top">
              <span>
                <strong>{n.client_name ?? '—'}</strong> — {t(`templates.event.${n.event}` as Key)}
              </span>
              <Status value={n.status} label={t(`notifications.status.${n.status}` as Key)} />
            </div>
            <span className="muted small">
              {t(`clients.channel.${n.channel}` as Key)} {n.to_address} — {f.dateTime(n.sent_at ?? n.scheduled_for)}
              {n.order_number && (
                <>
                  {' — '}
                  <Link to={`/orders/${n.order_id}`}>{n.order_number}</Link>
                </>
              )}
            </span>
            {n.error && <span className="error small">{n.error}</span>}
            {n.status === 'failed' && (
              <button className="btn small" onClick={async () => (await run(() => post(`/notifications/${n.id}/retry`))) && reload()}>
                {t('notifications.retry')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
