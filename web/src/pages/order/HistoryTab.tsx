import { OrderStatus } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';

export function HistoryTab({ d }: { d: any }) {
  const { t, f } = useI18n();
  return (
    <>
      <section className="section">
        <h2>{t('history.status')}</h2>
        <ol className="timeline">
          {d.history.map((h: any, i: number) => (
            <li key={h.id} className={i === d.history.length - 1 ? 'now' : ''}>
              <div className="row">
                <OrderStatus status={h.to_status} />
                <span className="muted small">
                  {f.dateTime(h.created_at)} — {h.actor === 'client' ? t('history.byClient') : h.actor === 'system' ? t('history.bySystem') : h.user_name}
                </span>
              </div>
              {h.note && <p className="small">{h.note}</p>}
            </li>
          ))}
        </ol>
      </section>

      {d.signatures.length > 0 && (
        <section className="section">
          <h2>{t('history.signatures')}</h2>
          <div className="photos">
            {d.signatures.map((s: any) => (
              <figure key={s.id} style={{ margin: 0 }} className="stack">
                <img src={`/api/signatures/${s.id}/file`} alt={s.signer_name} style={{ background: '#fff', borderRadius: 8 }} />
                <figcaption className="small">
                  {t(`history.signature.${s.kind}` as Key)} — {s.signer_name}
                  <div className="muted">{f.dateTime(s.created_at)}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>{t('history.messages')}</h2>
        {d.messages.length === 0 ? (
          <p className="muted">{t('common.none')}</p>
        ) : (
          <div className="stack">
            {d.messages.map((m: any) => (
              <div key={m.id} className={`bubble ${m.direction}`}>
                <p>{m.body}</p>
                <span className="muted small">
                  {f.dateTime(m.created_at)} — {m.channel}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {d.order.items_left || d.order.return_parts ? (
        <section className="section">
          <dl className="kv">
            {d.order.return_parts && (
              <>
                <dt>{t('order.returnParts')}</dt>
                <dd>{t('common.yes')}</dd>
              </>
            )}
            {d.order.items_left && (
              <>
                <dt>{t('order.itemsLeft')}</dt>
                <dd>{d.order.items_left}</dd>
              </>
            )}
          </dl>
        </section>
      ) : null}
    </>
  );
}
