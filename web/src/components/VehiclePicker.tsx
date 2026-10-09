import { useState } from 'react';
import { useI18n } from '../i18n';
import { MAKES, modelYears, VEHICLES } from '../lib/vehicles';
import { Input, Select } from './ui';

const OTHER = '__other';

function match(list: string[], v: string) {
  const x = v.trim().toLowerCase();
  return x ? list.find((m) => m.toLowerCase() === x) ?? null : null;
}

/**
 * Marca → modelo → año con menús desplegables (marcas y modelos comunes en Quebec).
 * «Otra»/«Otro» deja escribirlo a mano. Acepta valores que vengan del VIN (p. ej. «HONDA»).
 */
export function VehiclePicker({
  make,
  model,
  year,
  onChange,
  yearOptional = false,
  errors = {},
}: {
  make: string;
  model: string;
  year: string;
  onChange: (v: { make: string; model: string; year: string }) => void;
  yearOptional?: boolean;
  errors?: { make?: string; model?: string };
}) {
  const { t } = useI18n();
  const known = match(MAKES, make);
  const [makeOther, setMakeOther] = useState(Boolean(make && !known));
  const models = known ? VEHICLES[known]! : [];
  const knownModel = match(models, model);
  const [modelOther, setModelOther] = useState(Boolean(model && !knownModel));
  const years = modelYears();
  const yearNum = Number(year);
  const yearList = year && !years.includes(yearNum) ? [yearNum, ...years] : years;

  const makeValue = makeOther ? OTHER : known ?? '';
  const modelValue = modelOther || (!known && make) ? OTHER : knownModel ?? '';

  return (
    <div className="vpicker">
      <div className="stack" style={{ gap: 6 }}>
        <Select
          label={t('book.make')}
          error={!makeOther ? errors.make : undefined}
          value={makeValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === OTHER) {
              setMakeOther(true);
              setModelOther(true);
              onChange({ make: '', model: '', year });
            } else {
              setMakeOther(false);
              setModelOther(false);
              onChange({ make: v, model: '', year });
            }
          }}
        >
          <option value="">{t('veh.pickMake')}</option>
          {MAKES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={OTHER}>{t('veh.otherMake')}</option>
        </Select>
        {makeOther && <Input label={t('veh.typeMake')} error={errors.make} value={make} onChange={(e) => onChange({ make: e.target.value, model, year })} autoFocus />}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {makeOther ? (
          <Input label={t('book.model')} error={errors.model} value={model} onChange={(e) => onChange({ make, model: e.target.value, year })} />
        ) : (
          <>
            <Select
              label={t('book.model')}
              error={!modelOther ? errors.model : undefined}
              value={modelValue}
              disabled={!known}
              onChange={(e) => {
                const v = e.target.value;
                setModelOther(v === OTHER);
                onChange({ make, model: v === OTHER ? '' : v, year });
              }}
            >
              <option value="">{known ? t('veh.pickModel') : t('veh.makeFirst')}</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              {known && <option value={OTHER}>{t('veh.otherModel')}</option>}
            </Select>
            {modelOther && known && <Input label={t('veh.typeModel')} error={errors.model} value={model} onChange={(e) => onChange({ make, model: e.target.value, year })} autoFocus />}
          </>
        )}
      </div>
      <Select label={yearOptional ? `${t('book.year')} (${t('common.optional')})` : t('book.year')} value={year} onChange={(e) => onChange({ make, model, year: e.target.value })}>
        <option value="">{t('veh.pickYear')}</option>
        {yearList.map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
