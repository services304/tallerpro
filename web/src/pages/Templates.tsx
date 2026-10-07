import { useState } from 'react';
import { put } from '../api';
import { Input, LoadError, Loading, Seg, Sheet, TextArea, useAction, useLoad } from '../components/ui';
import { useI18n, type Key, type Lang } from '../i18n';

export function Templates() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useLoad<any[]>('/templates');
  const [tl, setTl] = useState<Lang>(lang === 'es' ? 'fr' : lang);
  const [channel, setChannel] = useState<'sms' | 'whatsapp' | 'email'>('sms');
  const [edit, setEdit] = useState<any>(null);
  const { run, busy } = useAction();

  if (loading && !data) return <Loading />;
  if (error) return <LoadError error={error} retry={reload} />;
  const rows = data!.filter((r) => r.lang === tl && r.channel === channel);

  return (
    <>
      <h1>{t('templates.title')}</h1>
      <p className="muted small">{t('templates.help')}</p>
      <div className="row">
        <Seg label={t('common.language')} value={tl} onChange={setTl} options={(['fr', 'en', 'es'] as const).map((l) => ({ value: l, label: t(`lang.${l}`) }))} />
        <Seg
          label={t('clients.channels')}
          value={channel}
          onChange={setChannel}
          options={(['sms', 'whatsapp', 'email'] as const).map((c) => ({ value: c, label: t(`clients.channel.${c}` as Key) }))}
        />
      </div>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.event}>
            <button className="item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => setEdit({ ...r })}>
              <div className="item-top">
                <span className="item-title">{t(`templates.event.${r.event}` as Key)}</span>
                {r.custom && <span className="status s-wait">{t('templates.custom')}</span>}
              </div>
              <span className="muted small">{r.body}</span>
            </button>
          </li>
        ))}
      </ul>
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit ? t(`templates.event.${edit.event}` as Key) : ''}>
        {edit && (
          <>
            {edit.channel === 'email' && <Input label={t('templates.subject')} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />}
            <TextArea label={t('templates.body')} rows={5} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <p className="muted small">{edit.body.length} / 160</p>
            <div className="row">
              <button
                className="btn primary"
                disabled={busy}
                onClick={async () => {
                  if (await run(() => put('/templates', { event: edit.event, channel: edit.channel, lang: edit.lang, subject: edit.subject, body: edit.body }), t('common.saved'))) {
                    setEdit(null);
                    reload();
                  }
                }}
              >
                {t('common.save')}
              </button>
              {edit.custom && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    if (await run(() => put('/templates', { event: edit.event, channel: edit.channel, lang: edit.lang, body: edit.body, reset: true }))) {
                      setEdit(null);
                      reload();
                    }
                  }}
                >
                  {t('templates.reset')}
                </button>
              )}
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
