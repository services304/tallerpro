import { useRef, useState } from 'react';
import { api, post } from '../api';
import { ChannelPicker } from '../components/forms';
import { Select, Status, useAction, useLoad, useToast } from '../components/ui';
import { useI18n, type Key, type Lang } from '../i18n';

const FIELDS = ['name', 'first', 'last', 'phone', 'email'] as const;

export function Import() {
  const { t, f } = useI18n();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [include, setInclude] = useState<Set<number>>(new Set());
  const [lang, setLang] = useState<Lang>('fr');
  const [channels, setChannels] = useState<string[]>(['sms']);
  const history = useLoad<any[]>('/imports');
  const { run, busy } = useAction();

  async function load(fl: File, mapping?: any) {
    const fd = new FormData();
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    fd.append('file', fl);
    const r = await run(() => api('POST', '/imports/preview', fd));
    if (r) {
      setPreview(r);
      setInclude(new Set(r.rows.filter((x: any) => x.status === 'new').map((x: any) => x.row)));
    }
  }

  async function commit() {
    const rows = preview.rows.filter((r: any) => include.has(r.row)).map((r: any) => ({ name: r.name || r.phone || r.email, phone: r.phone, email: r.email, note: r.note }));
    const r = await run(() => post('/imports/commit', { filename: preview.filename, lang, channels, rows }));
    if (r) {
      toast(t('import.done', { created: r.created, skipped: r.skipped }));
      setPreview(null);
      setFile(null);
      history.reload();
    }
  }

  return (
    <>
      <h1>{t('import.title')}</h1>
      <p>{t('import.help')}</p>
      <p className="muted small">{t('import.howTo')}</p>
      <div className="row">
        <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {t('import.pick')}
        </button>
        {file && <span className="muted">{file.name}</span>}
        <input
          ref={fileRef}
          type="file"
          accept=".vcf,.vcard,.csv,text/vcard,text/csv"
          hidden
          onChange={(e) => {
            const fl = e.target.files?.[0];
            e.target.value = '';
            if (fl) {
              setFile(fl);
              void load(fl);
            }
          }}
        />
      </div>

      {preview && (
        <section className="section">
          <p className="notice">{t('import.summary', preview.summary)}</p>
          {preview.format === 'csv' && (
            <div className="grid2">
              {FIELDS.map((k) => (
                <Select
                  key={k}
                  label={t('import.column', { field: k })}
                  value={preview.mapping[k] ?? ''}
                  onChange={(e) => {
                    const mapping = { ...preview.mapping, [k]: e.target.value === '' ? undefined : Number(e.target.value) };
                    if (file) void load(file, mapping);
                  }}
                >
                  <option value="">—</option>
                  {preview.headers.map((h: string, i: number) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
          )}
          <div className="grid2">
            <Select label={t('import.defaultLang')} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
              <option value="fr">{t('lang.fr')}</option>
              <option value="en">{t('lang.en')}</option>
              <option value="es">{t('lang.es')}</option>
            </Select>
            <ChannelPicker value={channels} onChange={setChannels} hasEmail />
          </div>
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table className="lines">
              <thead>
                <tr>
                  <th>{t('import.include')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('common.phone')}</th>
                  <th>{t('common.email')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r: any) => (
                  <tr key={r.row}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ width: 22, minHeight: 22 }}
                        disabled={r.status === 'existing' || (!r.phone && !r.email)}
                        checked={include.has(r.row)}
                        aria-label={r.name}
                        onChange={(e) => {
                          const n = new Set(include);
                          if (e.target.checked) n.add(r.row);
                          else n.delete(r.row);
                          setInclude(n);
                        }}
                      />
                    </td>
                    <td>{r.name || '—'}</td>
                    <td className="nowrap">{r.phone ?? <span className="muted">{r.phoneRaw}</span>}</td>
                    <td>{r.email}</td>
                    <td>
                      <Status value={r.status === 'new' ? 'paid' : r.status === 'invalid' ? 'failed' : 'closed'} label={t(`import.status.${r.status}` as Key)} />
                      {r.existing && <div className="muted small">{r.existing.name}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn primary" disabled={busy || include.size === 0} onClick={commit}>
            {t('import.commit', { n: include.size })}
          </button>
        </section>
      )}

      {history.data && history.data.length > 0 && (
        <section className="section">
          <h2>{t('import.history')}</h2>
          <ul className="list">
            {history.data.map((b) => (
              <li key={b.id} className="item">
                <div className="item-top">
                  <span>
                    {b.filename} — {f.dateTime(b.created_at)}
                  </span>
                  {b.undone_at ? (
                    <span className="status s-off">{t('import.undone')}</span>
                  ) : (
                    <button
                      className="btn small"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(t('common.confirm'))) return;
                        const r = await run(() => post(`/imports/${b.id}/undo`));
                        if (r) {
                          toast(t('import.undoResult', r));
                          history.reload();
                        }
                      }}
                    >
                      {t('import.undo')}
                    </button>
                  )}
                </div>
                <span className="muted small">{t('import.done', { created: b.created_count, skipped: b.skipped_count })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
