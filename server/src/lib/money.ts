/** Cálculos de dinero en centavos. TPS 5 % y TVQ 9,975 % (Quebec). */

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

/** Redondeo al centavo, mitad hacia arriba, sin errores de coma flotante. */
export function roundCents(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x) + 1e-9);
}

export function lineTotal(quantity: number, unitPriceCents: number, kind?: string): number {
  const t = roundCents(quantity * unitPriceCents);
  return kind === 'discount' ? -t : t;
}

export interface TotalsInput {
  quantity: number;
  unit_price_cents: number;
  kind: string;
}

export interface Totals {
  subtotal_cents: number;
  gst_cents: number;
  qst_cents: number;
  total_cents: number;
}

export function computeTotals(lines: TotalsInput[], taxesRegistered: boolean): Totals {
  const subtotal = Math.max(0, lines.reduce((s, l) => s + lineTotal(l.quantity, l.unit_price_cents, l.kind), 0));
  const gst = taxesRegistered ? roundCents(subtotal * GST_RATE) : 0;
  const qst = taxesRegistered ? roundCents(subtotal * QST_RATE) : 0;
  return { subtotal_cents: subtotal, gst_cents: gst, qst_cents: qst, total_cents: subtotal + gst + qst };
}

/** Precio de venta de una pieza: costo + margen (en puntos básicos, 3000 = 30 %). */
export function priceWithMargin(costCents: number, marginBp: number): number {
  return roundCents(costCents * (1 + marginBp / 10000));
}

export function formatMoney(cents: number, lang: 'fr' | 'en' | 'es'): string {
  // En español se usa el formato de Quebec (1 234,56 $), igual que en francés.
  const locale = lang === 'en' ? 'en-CA' : 'fr-CA';
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  return lang === 'en' ? `$${s}` : `${s} $`;
}
