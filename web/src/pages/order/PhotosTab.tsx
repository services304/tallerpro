import { useEffect, useRef, useState } from 'react';
import { del, patch } from '../../api';
import { IconCamera, IconEye, IconLock, IconVideo } from '../../components/icons';
import { Seg, useAction } from '../../components/ui';
import { useI18n, type Key } from '../../i18n';
import { onQueueChange, uploadPhoto } from '../../uploadQueue';

const STAGES = ['intake', 'diagnosis', 'during', 'after'] as const;

export function PhotoGrid({ photos, srcFor, onToggle, onDelete }: { photos: any[]; srcFor: (p: any) => string; onToggle?: (p: any) => void; onDelete?: (p: any) => void }) {
  const { t } = useI18n();
  return (
    <div className="photos">
      {photos.map((p) => (
        <figure className="photo" key={p.id} style={{ margin: 0 }}>
          {p.kind === 'video' ? <video src={srcFor(p)} controls preload="metadata" /> : <a href={srcFor(p)} target="_blank" rel="noreferrer"><img src={srcFor(p)} alt={p.caption || t(`photos.stage.${p.stage}` as Key)} loading="lazy" /></a>}
          <span className="badge">{p.caption || t(`photos.stage.${p.stage}` as Key)}</span>
          {onToggle && (
            <button className="btn small toggle" title={p.shared ? t('photos.shared') : t('photos.private')} onClick={() => onToggle(p)}>
              {p.shared ? <IconEye /> : <IconLock />}
              <span className="sr-only">{p.shared ? t('photos.shared') : t('photos.private')}</span>
            </button>
          )}
          {onDelete && (
            <button className="btn small" style={{ position: 'absolute', right: 6, bottom: 6 }} onClick={() => onDelete(p)}>
              ×<span className="sr-only">{t('common.delete')}</span>
            </button>
          )}
        </figure>
      ))}
    </div>
  );
}

/** Botones para tomar fotos o video; los archivos se comprimen y suben (o esperan señal). */
export function CaptureButtons({ orderId, stage, caption, damageZone, onDone }: { orderId: string; stage: string; caption?: string; damageZone?: string; onDone: () => void }) {
  const { t } = useI18n();
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const { run, busy } = useAction();
  async function handle(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      await run(() => uploadPhoto(orderId, file, { stage, caption: caption ?? '', ...(damageZone ? { damage_zone: damageZone } : {}) }));
    }
    onDone();
  }
  return (
    <div className="row">
      <button type="button" className="btn primary" disabled={busy} onClick={() => photo.current?.click()}>
        <IconCamera />
        {busy ? t('photos.uploading') : caption || t('photos.take')}
      </button>
      <button type="button" className="btn" disabled={busy} onClick={() => video.current?.click()}>
        <IconVideo />
        {t('photos.video')}
      </button>
      <input ref={photo} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => (void handle(e.target.files), (e.target.value = ''))} />
      <input ref={video} type="file" accept="video/*" capture="environment" hidden onChange={(e) => (void handle(e.target.files), (e.target.value = ''))} />
    </div>
  );
}

export function PhotosTab({ d, reload }: { d: any; reload: () => void }) {
  const { t } = useI18n();
  const { run } = useAction();
  const defaultStage = d.order.status === 'received' ? 'intake' : ['diagnosis', 'parts_quote', 'quote_sent'].includes(d.order.status) ? 'diagnosis' : ['ready', 'delivered', 'closed', 'quality_check'].includes(d.order.status) ? 'after' : 'during';
  const [stage, setStage] = useState<string>(defaultStage);
  const [queued, setQueued] = useState(0);
  useEffect(() => onQueueChange(setQueued), []);

  return (
    <section className="section">
      <Seg label={t('photos.stage')} value={stage} onChange={setStage} options={STAGES.map((s) => ({ value: s, label: t(`photos.stage.${s}` as Key) }))} />
      <CaptureButtons orderId={d.order.id} stage={stage} onDone={reload} />
      {queued > 0 && <p className="notice">{t('photos.queued', { n: queued })}</p>}
      {d.photos.length === 0 ? (
        <p className="muted">{t('photos.empty')}</p>
      ) : (
        STAGES.filter((s) => d.photos.some((p: any) => p.stage === s)).map((s) => (
          <div className="stack" key={s}>
            <h3>{t(`photos.stage.${s}` as Key)}</h3>
            <PhotoGrid
              photos={d.photos.filter((p: any) => p.stage === s)}
              srcFor={(p) => `/api/photos/${p.id}/file`}
              onToggle={async (p) => (await run(() => patch(`/photos/${p.id}`, { shared: !p.shared }))) && reload()}
              onDelete={async (p) => confirm(t('common.confirm')) && (await run(() => del(`/photos/${p.id}`))) && reload()}
            />
          </div>
        ))
      )}
    </section>
  );
}
