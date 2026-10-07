import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { get, post } from '../api';
import { CarMap } from '../components/CarMap';
import { ClientForm, ClientSearch, emptyVehicle, VehicleFields, vehicleBody, type VehicleDraft } from '../components/forms';
import { DictateButton, SignaturePad, type SignatureHandle } from '../components/media';
import { Check, Field, Input, Select, TextArea, useAction, useToast, vehicleName } from '../components/ui';
import { useI18n, type Key } from '../i18n';
import { CaptureButtons } from './order/PhotosTab';
import { toLocalInput } from './Agenda';

const STEPS = ['client', 'vehicle', 'state', 'terms', 'sign', 'photos'] as const;
const DAMAGE_TYPES = ['scratch', 'dent', 'crack', 'broken'] as const;

export function Intake() {
  const { t, f } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const visitId = params.get('visit');
  const { run, busy } = useAction();
  const [step, setStep] = useState(0);

  const [client, setClient] = useState<any>(null);
  const [creatingClient, setCreatingClient] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [newVehicle, setNewVehicle] = useState<VehicleDraft>(emptyVehicle);
  const [visit, setVisit] = useState<any>(null);
  const [fee, setFee] = useState<number>(0);

  const [state, setState] = useState({ odometer: '', fuel: 4 });
  const [damageType, setDamageType] = useState<(typeof DAMAGE_TYPES)[number]>('scratch');
  const [damages, setDamages] = useState<{ zone: string; type: string }[]>([]);
  const [terms, setTerms] = useState({ reason: '', return_parts: false, waive_estimate: false, contact_first: true, items_left: '', consent_maintenance: false, promised: '' });
  const [signer, setSigner] = useState('');
  const [signed, setSigned] = useState(false);
  const sig = useRef<SignatureHandle>(null);
  const [order, setOrder] = useState<{ id: string; number: string } | null>(null);
  const [shots, setShots] = useState<string[]>([]);

  // Visita: cliente, vehículo y cargo ya conocidos.
  useEffect(() => {
    const cid = params.get('client');
    if (cid) get(`/clients/${cid}`).then((d) => setClient(d.client));
    if (visitId) {
      get('/visits').then((list: any[]) => {
        const v = list.find((x) => x.id === visitId);
        if (v) {
          setVisit(v);
          setFee(v.visit_fee_cents);
          if (v.vehicle_id) setVehicleId(v.vehicle_id);
        }
      });
    } else get('/settings').then((s) => setFee(s.visit_fee_cents));
  }, [params, visitId]);

  useEffect(() => {
    if (!client) return;
    setSigner(client.name);
    get(`/clients/${client.id}`).then((d) => {
      setVehicles(d.vehicles);
      setVehicleId((cur) => cur || d.vehicles[0]?.id || '');
      setTerms((x) => ({ ...x, consent_maintenance: d.consents.find((c: any) => c.kind === 'maintenance')?.granted ?? false }));
    });
    if (client && step === 0 && params.get('client')) setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  const zoneLabel = (z: string) => t(`intake.zone.${z}` as Key);

  async function next() {
    if (step === 1 && !vehicleId) {
      const r = await run(() => post('/vehicles', { client_id: client.id, ...vehicleBody(newVehicle) }));
      if (!r) return;
      setVehicleId(r.id);
    }
    setStep(step + 1);
  }

  async function finish() {
    const image = sig.current?.toDataUrl();
    if (!image) return toast(t('intake.signTitle'), true);
    const o = await run(() =>
      post('/orders', {
        client_id: client.id,
        vehicle_id: vehicleId,
        visit_id: visitId,
        odometer_in: state.odometer ? Number(state.odometer.replace(/\D/g, '')) : null,
        fuel_level: state.fuel,
        reason: terms.reason,
        service_address: visit?.address ?? client.address ?? '',
        promised_at: terms.promised ? new Date(terms.promised).toISOString() : null,
        return_parts: terms.return_parts,
        waive_estimate: terms.waive_estimate,
        contact_first: terms.contact_first,
        items_left: terms.items_left,
        damages: damages.map((d) => ({ zone: zoneLabel(d.zone), type: t(`intake.damage.${d.type}` as Key) })),
        consent_maintenance: terms.consent_maintenance,
      }),
    );
    if (!o) return;
    await run(() => post(`/orders/${o.id}/signatures`, { kind: 'intake', signer_name: signer, image }));
    // Pasa a diagnóstico: la recepción está firmada.
    await run(() => post(`/orders/${o.id}/status`, { to: 'diagnosis', notify: false }));
    setOrder(o);
    toast(t('intake.done', { n: o.number }));
    setStep(5);
  }

  const vehicleOk = vehicleId || newVehicle.make || newVehicle.vin || newVehicle.plate;

  return (
    <>
      <div className="page-head">
        <h1>{t('intake.title')}</h1>
        {visit && <span className="muted">{f.dayShort(visit.scheduled_start)} {f.time(visit.scheduled_start)}</span>}
      </div>
      <div className="steps" style={{ gridTemplateColumns: `repeat(${STEPS.length}, 1fr)` }} aria-hidden="true">
        {STEPS.map((s, i) => (
          <div key={s} className={i <= step ? 'on' : ''} />
        ))}
      </div>
      <h2>{t(`intake.step.${STEPS[step] === 'photos' ? 'state' : STEPS[step]}` as Key).replace(/^/, `${step + 1}. `)}{STEPS[step] === 'photos' ? ` — ${t('intake.photosGuided')}` : ''}</h2>

      {step === 0 &&
        (client ? (
          <div className="panel pad">
            <strong>{client.name}</strong>
            <span className="muted">{[client.phone, client.address].filter(Boolean).join(' — ')}</span>
            <div className="row">
              <button className="btn" onClick={() => setClient(null)}>
                {t('common.edit')}
              </button>
              <button className="btn primary" onClick={() => setStep(1)}>
                {t('common.next')}
              </button>
            </div>
          </div>
        ) : creatingClient ? (
          <ClientForm
            submitLabel={t('common.next')}
            onSaved={async (id) => {
              const d = await get(`/clients/${id}`);
              setClient(d.client);
              setCreatingClient(false);
              setStep(1);
            }}
          />
        ) : (
          <div className="stack">
            <ClientSearch onPick={(c) => (setClient(c), setStep(1))} />
            <button className="btn" onClick={() => setCreatingClient(true)}>
              {t('intake.newClient')}
            </button>
          </div>
        ))}

      {step === 1 && (
        <div className="stack">
          {vehicles.length > 0 && (
            <Field label={t('intake.pickVehicle')}>
              <div className="list">
                {vehicles.map((v) => (
                  <label key={v.id} className="check item">
                    <input type="radio" name="veh" checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} />
                    <span>
                      <strong>{vehicleName(v) || v.vin}</strong> <span className="muted">{v.plate}</span>
                    </span>
                  </label>
                ))}
                <label className="check item">
                  <input type="radio" name="veh" checked={!vehicleId} onChange={() => setVehicleId('')} />
                  <span>{t('intake.newVehicle')}</span>
                </label>
              </div>
            </Field>
          )}
          {!vehicleId && <VehicleFields v={newVehicle} onChange={setNewVehicle} />}
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <div className="grid2">
            <Input label={t('intake.odometer')} inputMode="numeric" value={state.odometer} onChange={(e) => setState({ ...state, odometer: e.target.value })} />
            <Field label={`${t('intake.fuel')}: ${state.fuel}/8`}>
              <input type="range" min={0} max={8} value={state.fuel} onChange={(e) => setState({ ...state, fuel: Number(e.target.value) })} style={{ padding: 0 }} />
            </Field>
          </div>
          <Field label={t('intake.damages')} hint={t('intake.damagesHelp')}>
            <Select label={t('intake.damageType')} value={damageType} onChange={(e) => setDamageType(e.target.value as any)}>
              {DAMAGE_TYPES.map((d) => (
                <option key={d} value={d}>
                  {t(`intake.damage.${d}` as Key)}
                </option>
              ))}
            </Select>
          </Field>
          <CarMap hits={damages.map((d) => d.zone)} onPick={(zone) => setDamages([...damages, { zone, type: damageType }])} />
          {damages.length > 0 && (
            <ul className="list">
              {damages.map((d, i) => (
                <li key={i} className="item">
                  <div className="item-top">
                    <span>
                      {zoneLabel(d.zone)} — {t(`intake.damage.${d.type}` as Key)}
                    </span>
                    <button className="btn ghost small" onClick={() => setDamages(damages.filter((_, j) => j !== i))}>
                      {t('common.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          <TextArea label={t('intake.reason')} value={terms.reason} onChange={(e) => setTerms({ ...terms, reason: e.target.value })} />
          <DictateButton onText={(txt) => setTerms((x) => ({ ...x, reason: x.reason ? `${x.reason} ${txt}` : txt }))} />
          <Check label={t('intake.contactFirst')} checked={terms.contact_first} onChange={(v) => setTerms({ ...terms, contact_first: v })} />
          <Check label={t('intake.returnParts')} checked={terms.return_parts} onChange={(v) => setTerms({ ...terms, return_parts: v })} />
          <Check label={t('intake.waiveEstimate')} checked={terms.waive_estimate} onChange={(v) => setTerms({ ...terms, waive_estimate: v })} />
          <Check label={t('intake.consentMaintenance')} checked={terms.consent_maintenance} onChange={(v) => setTerms({ ...terms, consent_maintenance: v })} />
          <Input label={`${t('intake.itemsLeft')} (${t('common.optional')})`} value={terms.items_left} onChange={(e) => setTerms({ ...terms, items_left: e.target.value })} />
          <Input
            label={`${t('intake.promised')} (${t('common.optional')})`}
            type="datetime-local"
            min={toLocalInput(new Date())}
            value={terms.promised}
            onChange={(e) => setTerms({ ...terms, promised: e.target.value })}
          />
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          {fee > 0 && <p className="notice">{t('intake.feeNotice', { fee: f.money(fee) })}</p>}
          <p>{t('intake.signText')}</p>
          <Input label={t('intake.signerName')} value={signer} onChange={(e) => setSigner(e.target.value)} />
          <SignaturePad ref={sig} onChange={(empty) => setSigned(!empty)} />
          <div className="row">
            <button className="btn" onClick={() => sig.current?.clear()}>
              {t('intake.clear')}
            </button>
            <button className="btn primary" disabled={busy || !signed || !signer.trim()} onClick={finish}>
              {t('intake.finish')}
            </button>
          </div>
        </div>
      )}

      {step === 5 && order && (
        <div className="stack">
          {(['front', 'rear', 'left', 'right', 'dash'] as const).map((h) => (
            <div key={h} className="row between panel pad" style={{ display: 'flex' }}>
              <span>
                {shots.includes(h) ? '✓ ' : ''}
                {t(`intake.photoHint.${h}` as Key)}
              </span>
              <CaptureButtons orderId={order.id} stage="intake" caption={t(`intake.photoHint.${h}` as Key)} onDone={() => setShots((s) => [...s, h])} />
            </div>
          ))}
          {damages.map((d, i) => (
            <div key={i} className="row between panel pad" style={{ display: 'flex' }}>
              <span>
                {shots.includes(`d${i}`) ? '✓ ' : ''}
                {zoneLabel(d.zone)} — {t(`intake.damage.${d.type}` as Key)}
              </span>
              <CaptureButtons orderId={order.id} stage="intake" caption={`${zoneLabel(d.zone)} — ${t(`intake.damage.${d.type}` as Key)}`} damageZone={d.zone} onDone={() => setShots((s) => [...s, `d${i}`])} />
            </div>
          ))}
          <button className="btn primary" onClick={() => nav(`/orders/${order.id}`)}>
            {t('today.openOrder', { n: order.number })}
          </button>
        </div>
      )}

      {step > 0 && step < 4 && (
        <div className="row">
          <button className="btn" onClick={() => setStep(step - 1)}>
            {t('common.previous')}
          </button>
          <button className="btn primary" disabled={busy || (step === 1 && !vehicleOk)} onClick={next}>
            {t('common.next')}
          </button>
        </div>
      )}
    </>
  );
}
