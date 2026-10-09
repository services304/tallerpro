import { useI18n } from '../i18n';
import { useLoad } from './ui';

/** «1,2 GB», «340 MB», «85 KB». */
export function sizeLabel(bytes: number, f: { number: (n: number) => string }) {
  if (bytes >= 1024 ** 3) return `${f.number(Math.round((bytes / 1024 ** 3) * 10) / 10)} GB`;
  if (bytes >= 1024 ** 2) return `${f.number(Math.round(bytes / 1024 ** 2))} MB`;
  if (bytes <= 0) return '0 MB';
  return `${f.number(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Espacio usado (Ajustes): barra, fotos guardadas y cuántas caben todavía. */
export function StorageMeter() {
  const { t, f } = useI18n();
  const { data: u } = useLoad<any>('/storage/usage');
  if (!u) return null;
  const pct = u.percent ?? 0;
  const tone = pct >= 90 ? 'var(--danger)' : pct >= 80 ? 'var(--accent)' : 'var(--ok)';
  return (
    <section className="section">
      <h2>{t('storage.title')}</h2>
      <div className="panel pad stack">
        {u.limit_bytes ? (
          <>
            <div className="item-top">
              <strong>
                {sizeLabel(u.used_bytes, f)} / {sizeLabel(u.limit_bytes, f)}
              </strong>
              <strong style={{ color: tone }}>{f.number(pct)} %</strong>
            </div>
            <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('storage.title')}>
              <span style={{ width: `${Math.max(pct, 1)}%`, background: tone }} />
            </div>
            <p className="muted small">{t('storage.left', { n: f.number(u.photos_left) })}</p>
          </>
        ) : (
          <strong>{sizeLabel(u.used_bytes, f)}</strong>
        )}
        <p className="muted small">
          {t('storage.photos', { n: f.number(u.photos), s: sizeLabel(u.photo_bytes, f) })}
          {u.videos > 0 && ` — ${t('storage.videos', { n: f.number(u.videos), s: sizeLabel(u.video_bytes, f) })}`}
        </p>
        {pct >= 80 && <p className="notice small">{t('storage.full')}</p>}
        <p className="muted small">{t('storage.tip')}</p>
      </div>
    </section>
  );
}
