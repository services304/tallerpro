import { describe, expect, it } from 'vitest';
import { en } from './i18n/en';
import { es } from './i18n/es';
import { fr } from './i18n/fr';
import { makeFormat, translate } from './i18n';
import { parseMoney } from './components/ui';

describe('textos de la interfaz', () => {
  it('ES, EN y FR tienen las mismas claves y ninguna vacía', () => {
    const keys = Object.keys(es).sort();
    expect(Object.keys(en).sort()).toEqual(keys);
    expect(Object.keys(fr).sort()).toEqual(keys);
    for (const d of [es, en, fr]) for (const v of Object.values(d)) expect(v.trim().length).toBeGreaterThan(0);
  });

  it('las variables {x} coinciden entre idiomas', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(es) as (keyof typeof es)[]) {
      expect(vars(en[k]), k).toBe(vars(es[k]));
      expect(vars(fr[k]), k).toBe(vars(es[k]));
    }
  });

  it('reemplaza variables', () => {
    expect(translate('es', 'invoice.number', { n: 1001 })).toBe('Factura n.º 1001');
    expect(translate('fr', 'invoice.number', { n: 1001 })).toBe('Facture no 1001');
    expect(translate('en', 'invoice.number', { n: 1001 })).toBe('Invoice no. 1001');
  });
});

describe('formatos', () => {
  it('montos al estilo de Quebec', () => {
    expect(makeFormat('fr').money(123456).replace(/\s/g, ' ')).toBe('1 234,56 $');
    expect(makeFormat('es').money(9000).replace(/\s/g, ' ')).toBe('90,00 $');
    expect(makeFormat('en').money(123456)).toBe('$1,234.56');
  });

  it('fechas en cada idioma (hora de Montreal)', () => {
    const d = '2026-09-15T16:00:00Z';
    expect(makeFormat('es').date(d)).toBe('15 de septiembre de 2026');
    expect(makeFormat('en').date(d)).toBe('September 15, 2026');
    expect(makeFormat('fr').date(d)).toBe('15 septembre 2026');
  });

  it('lee montos escritos con coma o punto', () => {
    expect(parseMoney('90')).toBe(9000);
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('$ 12.5')).toBe(1250);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});
