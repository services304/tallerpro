import { useState } from 'react';
import { patch, post } from '../api';
import { Check, Empty, Input, LoadError, Loading, MoneyInput, Seg, Sheet, TextArea, useAction, useLoad } from '../components/ui';
import { useI18n } from '../i18n';

export function WorkTypes() {
  const { t, f } = useI18n();
  const { data, error, loading, reload } = useLoad<any[]>('/work-types');
  const [edit, setEdit] = useState<any>(null);
  const { run, busy } = useAction();

  async function save() {
    const body = { name: edit.name, mode: edit.mode, price_cents: edit.price_cents ?? 0, est_minutes: edit.est_minutes ? Number(edit.est_minutes) : null, active: edit.active };
    const r = await run(() => (edit.id ? patch(`/work-types/${edit.id}`, body) : post('/work-types', body)), t('common.saved'));
    if (r) {
      setEdit(null);
      reload();
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('workTypes.title')}</h1>
          <p className="muted">{t('workTypes.help')}</p>
        </div>
        <button className="btn primary" onClick={() => setEdit({ name: '', mode: 'fixed', price_cents: null, est_minutes: '', active: true })}>
          {t('common.add')}
        </button>
      </div>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} retry={reload} />}
      {data?.length === 0 && <Empty>{t('workTypes.empty')}</Empty>}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((w) => (
            <li key={w.id}>
              <button className="item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', opacity: w.active ? 1 : 0.5 }} onClick={() => setEdit(w)}>
                <div className="item-top">
                  <span className="item-title">{w.name}</span>
                  <strong>
                    {f.money(w.price_cents)}
                    {w.mode === 'hourly' ? ' /h' : ''}
                  </strong>
                </div>
                <span className="muted small">
                  {t(w.mode === 'hourly' ? 'workTypes.mode.hourly' : 'workTypes.mode.fixed')}
                  {w.est_minutes ? ` — ${w.est_minutes} min` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('common.add')}>
        {edit && (
          <>
            <Input label={t('common.name')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Seg
              label={t('workTypes.title')}
              value={edit.mode}
              onChange={(mode) => setEdit({ ...edit, mode })}
              options={[
                { value: 'fixed', label: t('workTypes.mode.fixed') },
                { value: 'hourly', label: t('workTypes.mode.hourly') },
              ]}
            />
            <div className="grid2">
              <MoneyInput label={t('common.price')} cents={edit.price_cents} onChange={(price_cents) => setEdit({ ...edit, price_cents })} />
              <Input label={t('workTypes.minutes')} type="number" min={1} value={edit.est_minutes ?? ''} onChange={(e) => setEdit({ ...edit, est_minutes: e.target.value })} />
            </div>
            <Check label={t('workTypes.active')} checked={edit.active} onChange={(active) => setEdit({ ...edit, active })} />
            <button className="btn primary" disabled={busy || !edit.name || edit.price_cents === null} onClick={save}>
              {t('common.save')}
            </button>
          </>
        )}
      </Sheet>
    </>
  );
}

export function Suppliers() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useLoad<any[]>('/suppliers');
  const [edit, setEdit] = useState<any>(null);
  const { run, busy } = useAction();

  async function save() {
    const body = { name: edit.name, contact_name: edit.contact_name ?? '', phone: edit.phone || null, email: edit.email || null, notes: edit.notes ?? '', active: edit.active };
    const r = await run(() => (edit.id ? patch(`/suppliers/${edit.id}`, body) : post('/suppliers', body)), t('common.saved'));
    if (r) {
      setEdit(null);
      reload();
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{t('suppliers.title')}</h1>
        <button className="btn primary" onClick={() => setEdit({ name: '', contact_name: '', phone: '', email: '', notes: '', active: true })}>
          {t('common.add')}
        </button>
      </div>
      {loading && !data && <Loading />}
      {error && <LoadError error={error} retry={reload} />}
      {data?.length === 0 && <Empty>{t('suppliers.empty')}</Empty>}
      {data && data.length > 0 && (
        <ul className="list">
          {data.map((s) => (
            <li key={s.id}>
              <button className="item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', opacity: s.active ? 1 : 0.5 }} onClick={() => setEdit(s)}>
                <span className="item-title">{s.name}</span>
                <span className="muted small">{[s.contact_name, s.phone, s.email].filter(Boolean).join(' — ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? t('common.edit') : t('common.add')}>
        {edit && (
          <>
            <Input label={t('common.name')} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Input label={t('suppliers.contact')} value={edit.contact_name} onChange={(e) => setEdit({ ...edit, contact_name: e.target.value })} />
            <div className="grid2">
              <Input label={t('common.phone')} type="tel" value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              <Input label={t('common.email')} type="email" value={edit.email ?? ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </div>
            <TextArea label={t('common.notes')} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <Check label={t('workTypes.active')} checked={edit.active} onChange={(active) => setEdit({ ...edit, active })} />
            <button className="btn primary" disabled={busy || !edit.name} onClick={save}>
              {t('common.save')}
            </button>
          </>
        )}
      </Sheet>
    </>
  );
}
