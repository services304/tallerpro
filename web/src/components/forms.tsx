import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, get, patch, post } from '../api';
import { useI18n, type Key, type Lang } from '../i18n';
import { Check, Field, Input, Select, TextArea, useToast, vehicleName } from './ui';

// ---------- Cliente ----------

export interface ClientDraft {
  name: string;
  phone: string;
  email: string;
  address: string;
  lang: Lang;
  channels: string[];
  notes_internal: string;
}

export function emptyClient(lang: Lang): ClientDraft {
  return { name: '', phone: '', email: '', address: '', lang, channels: ['sms'], notes_internal: '' };
}

export function ChannelPicker({ value, onChange, hasEmail }: { value: string[]; onChange: (v: string[]) => void; hasEmail: boolean }) {
  const { t } = useI18n();
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500, padding: 0, marginBottom: 6 }}>{t('clients.channels')}</legend>
      <div className="row">
        {(['sms', 'whatsapp', 'email'] as const).map((c) => (
          <label key={c} className="check" style={{ paddingRight: 12 }}>
            <input type="checkbox" checked={value.includes(c)} disabled={c === 'email' && !hasEmail} onChange={() => toggle(c)} />
            <span>{t(`clients.channel.${c}` as Key)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Formulario de cliente. Si hay un duplicado, ofrece crearlo de todos modos. */
export function ClientForm({ initial, onSaved, submitLabel }: { initial?: Partial<ClientDraft> & { id?: string }; onSaved: (id: string) => void; submitLabel?: string }) {
  const { t, lang } = useI18n();
  const [c, setC] = useState<ClientDraft>({ ...emptyClient(lang === 'es' ? 'fr' : lang), ...initial } as ClientDraft);
  const [dup, setDup] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [consents, setConsents] = useState({ maintenance: false, promo: false });
  const set = (k: keyof ClientDraft) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value });

  async function save(force = false) {
    setBusy(true);
    setError('');
    try {
      const body = {
        ...c,
        phone: c.phone || null,
        email: c.email || null,
        channels: c.channels.filter((ch) => (ch === 'email' ? c.email : true)),
      };
      if (initial?.id) {
        await patch(`/clients/${initial.id}`, body);
        onSaved(initial.id);
      } else {
        const r = await post('/clients', { ...body, force, consent_maintenance: consents.maintenance, consent_promo: consents.promo });
        onSaved(r.id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'client.duplicate') setDup(e.message);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <Input label={t('common.name')} required autoComplete="off" value={c.name} onChange={set('name')} />
      <div className="grid2">
        <Input label={t('common.phone')} type="tel" inputMode="tel" value={c.phone ?? ''} onChange={set('phone')} />
        <Input label={t('common.email')} type="email" value={c.email ?? ''} onChange={set('email')} />
      </div>
      <Input label={t('common.address')} value={c.address} onChange={set('address')} autoComplete="street-address" />
      <div className="grid2">
        <Select label={t('common.language')} value={c.lang} onChange={(e) => setC({ ...c, lang: e.target.value as Lang })}>
          <option value="fr">{t('lang.fr')}</option>
          <option value="en">{t('lang.en')}</option>
          <option value="es">{t('lang.es')}</option>
        </Select>
        <ChannelPicker value={c.channels} hasEmail={Boolean(c.email)} onChange={(channels) => setC({ ...c, channels })} />
      </div>
      {!initial?.id && (
        <>
          <Check label={t('clients.consent.maintenance')} checked={consents.maintenance} onChange={(v) => setConsents({ ...consents, maintenance: v })} />
          <Check label={t('clients.consent.promo')} checked={consents.promo} onChange={(v) => setConsents({ ...consents, promo: v })} />
        </>
      )}
      <TextArea label={t('clients.internalNotes')} value={c.notes_internal} onChange={set('notes_internal')} />
      {dup && (
        <div className="error" role="alert">
          <p>{dup}</p>
          <button type="button" className="btn small" onClick={() => save(true)}>
            {t('clients.duplicateForce')}
          </button>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {submitLabel ?? t('common.save')}
      </button>
    </form>
  );
}

/** Buscador de clientes por nombre, teléfono, correo, placa o VIN. */
export function ClientSearch({ onPick, placeholder }: { onPick: (c: any) => void; placeholder?: string }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const h = setTimeout(() => {
      get(`/clients?q=${encodeURIComponent(q)}`).then(setRows).catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="stack">
      <input type="search" placeholder={placeholder ?? t('intake.findClient')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="list">
        {rows.slice(0, 8).map((c) => (
          <li key={c.id}>
            <button type="button" className="item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={() => onPick(c)}>
              <span className="item-title">{c.name}</span>
              <span className="muted small">{[c.phone, c.email, c.address].filter(Boolean).join(' — ')}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Vehículo ----------

export interface VehicleDraft {
  vin: string;
  plate: string;
  make: string;
  model: string;
  year: string;
  color: string;
  engine: string;
}

export const emptyVehicle: VehicleDraft = { vin: '', plate: '', make: '', model: '', year: '', color: '', engine: '' };

/** Escáner de VIN con la cámara (código de barras del marco de la puerta o del parabrisas), si el teléfono lo permite. */
function VinScanner({ onFound, onClose }: { onFound: (vin: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      const BD = (window as any).BarcodeDetector;
      if (!BD) return onClose();
      const detector = new BD({ formats: ['code_39', 'code_128', 'data_matrix', 'qr_code'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!video.current) return;
      video.current.srcObject = stream;
      await video.current.play();
      while (!stop) {
        try {
          const codes = await detector.detect(video.current);
          for (const c of codes) {
            const v = String(c.rawValue).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^I/, '');
            const m = /[A-HJ-NPR-Z0-9]{17}/.exec(v);
            if (m) {
              onFound(m[0]);
              return;
            }
          }
        } catch {
          /* siguiente cuadro */
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    })().catch(() => onClose());
    return () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [onFound, onClose]);
  return <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />;
}

export function VehicleFields({ v, onChange }: { v: VehicleDraft; onChange: (v: VehicleDraft) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [scan, setScan] = useState(false);
  const [info, setInfo] = useState('');
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  const set = (k: keyof VehicleDraft) => (e: { target: { value: string } }) => onChange({ ...v, [k]: e.target.value });

  async function decode(vin = v.vin) {
    setInfo('');
    try {
      const r = await get(`/vin/${encodeURIComponent(vin)}`);
      const next = { ...v, vin: r.vin };
      if (r.info) {
        Object.assign(next, { make: r.info.make || v.make, model: r.info.model || v.model, year: r.info.year ? String(r.info.year) : v.year, engine: r.info.engine || v.engine });
        setInfo(t('intake.vinFound', { v: vehicleName(r.info) }));
      } else setInfo(t('intake.vinNotFound'));
      if (!r.checkDigitOk) toast(t('intake.vinCheck'), true);
      onChange(next);
    } catch (e) {
      toast((e as Error).message, true);
    }
  }

  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <Input label={t('intake.vin')} value={v.vin} maxLength={17} autoCapitalize="characters" spellCheck={false} onChange={(e) => onChange({ ...v, vin: e.target.value.toUpperCase() })} />
        </div>
        <button type="button" className="btn" disabled={v.vin.replace(/\W/g, '').length !== 17} onClick={() => decode()}>
          {t('intake.decodeVin')}
        </button>
        {canScan && (
          <button type="button" className="btn" onClick={() => setScan(true)}>
            {t('intake.scanVin')}
          </button>
        )}
      </div>
      {scan && (
        <VinScanner
          onClose={() => setScan(false)}
          onFound={(vin) => {
            setScan(false);
            void decode(vin);
          }}
        />
      )}
      {info && <p className="notice">{info}</p>}
      <div className="grid2">
        <Input label={t('intake.make')} value={v.make} onChange={set('make')} />
        <Input label={t('intake.model')} value={v.model} onChange={set('model')} />
        <Input label={t('intake.year')} inputMode="numeric" value={v.year} onChange={set('year')} />
        <Input label={t('intake.plate')} value={v.plate} autoCapitalize="characters" onChange={set('plate')} />
        <Input label={t('intake.color')} value={v.color} onChange={set('color')} />
      </div>
    </div>
  );
}

export function vehicleBody(v: VehicleDraft) {
  return {
    vin: v.vin.trim() || null,
    plate: v.plate.trim() || null,
    make: v.make.trim(),
    model: v.model.trim(),
    year: v.year ? Number(v.year) : null,
    color: v.color.trim(),
    engine: v.engine.trim(),
  };
}
