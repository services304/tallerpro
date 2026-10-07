import PDFDocument from 'pdfkit';
import { one, q } from '../db.js';
import { notFound } from './errors.js';
import { docLabels, type Lang } from './i18n.js';
import { formatMoney } from './money.js';
import { formatPhone } from './phone.js';
import { fmtShortDate } from './time.js';

interface Line {
  kind: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  part_condition: string | null;
  decision?: string;
}

interface DocData {
  title: string;
  number: string;
  date: Date;
  validUntil?: Date;
  shop: { name: string; address: string; phone: string; email: string };
  client: { name: string; address: string; phone: string | null; email: string | null };
  vehicle: string;
  odometer: number | null;
  orderNumber: string;
  lines: Line[];
  subtotal: number;
  gst: number;
  qst: number;
  total: number;
  paid?: number;
  gstNo: string;
  qstNo: string;
  warranty: string;
  returnParts: boolean;
  showDecision: boolean;
}

function render(d: DocData, lang: Lang): Promise<Buffer> {
  const L = docLabels[lang];
  const money = (c: number) => formatMoney(c, lang);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: `${d.title} ${d.number}`, Author: d.shop.name } });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = 48;
    const right = doc.page.width - 48;
    const width = right - left;

    // Encabezado
    doc.font('Helvetica-Bold').fontSize(16).text(d.shop.name, left, 48);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    [d.shop.address, [formatPhone(d.shop.phone), d.shop.email].filter(Boolean).join(' · ')].filter(Boolean).forEach((l) => doc.text(l));
    if (d.gstNo || d.qstNo) doc.text([d.gstNo && `${L.gstNo} ${d.gstNo}`, d.qstNo && `${L.qstNo} ${d.qstNo}`].filter(Boolean).join(' · '));
    doc.fillColor('#000').font('Helvetica-Bold').fontSize(18).text(d.title, left, 48, { width, align: 'right' });
    doc.font('Helvetica').fontSize(10).text(`${L.number} ${d.number}`, { width, align: 'right' });
    doc.text(`${L.date} : ${fmtShortDate(d.date, lang)}`, { width, align: 'right' });
    if (d.validUntil) doc.text(`${L.validUntil} : ${fmtShortDate(d.validUntil, lang)}`, { width, align: 'right' });

    // Cliente y vehículo
    let y = Math.max(doc.y, 130) + 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor('#ccc').stroke();
    y += 10;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#666').text(L.client.toUpperCase(), left, y);
    doc.text(L.vehicle.toUpperCase(), left + width / 2, y);
    doc.font('Helvetica').fontSize(10).fillColor('#000');
    doc.text([d.client.name, d.client.address, formatPhone(d.client.phone), d.client.email].filter(Boolean).join('\n'), left, y + 13, { width: width / 2 - 12 });
    const yAfterClient = doc.y;
    doc.text([d.vehicle, d.odometer ? `${L.odometer} : ${d.odometer.toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA')} km` : '', `${L.order} ${d.orderNumber}`].filter(Boolean).join('\n'), left + width / 2, y + 13, { width: width / 2 });
    y = Math.max(yAfterClient, doc.y) + 18;

    // Tabla
    const cols = d.showDecision
      ? [{ w: 0.46, t: L.description }, { w: 0.09, t: L.qty, a: 'right' }, { w: 0.15, t: L.unitPrice, a: 'right' }, { w: 0.15, t: L.amount, a: 'right' }, { w: 0.15, t: '', a: 'right' }]
      : [{ w: 0.55, t: L.description }, { w: 0.1, t: L.qty, a: 'right' }, { w: 0.17, t: L.unitPrice, a: 'right' }, { w: 0.18, t: L.amount, a: 'right' }];
    const xs: number[] = [];
    cols.reduce((x, c) => (xs.push(x), x + c.w * width), left);
    doc.rect(left, y, width, 20).fill('#f1f1f1').fillColor('#000');
    doc.font('Helvetica-Bold').fontSize(9);
    cols.forEach((c, i) => doc.text(c.t, xs[i]! + 4, y + 6, { width: c.w * width - 8, align: (c.a as any) ?? 'left' }));
    y += 24;
    doc.font('Helvetica').fontSize(9.5);
    for (const l of d.lines) {
      const cond = l.kind === 'part' && l.part_condition ? ` — ${L[l.part_condition]}` : '';
      const desc = `${l.description}${cond}`;
      const h = Math.max(doc.heightOfString(desc, { width: cols[0]!.w * width - 8 }), 12);
      if (y + h > doc.page.height - 160) {
        doc.addPage();
        y = 48;
      }
      doc.text(desc, xs[0]! + 4, y, { width: cols[0]!.w * width - 8 });
      doc.text(String(l.quantity), xs[1]! + 4, y, { width: cols[1]!.w * width - 8, align: 'right' });
      doc.text(money(l.kind === 'discount' ? -l.unit_price_cents : l.unit_price_cents), xs[2]! + 4, y, { width: cols[2]!.w * width - 8, align: 'right' });
      doc.text(money(l.total_cents), xs[3]! + 4, y, { width: cols[3]!.w * width - 8, align: 'right' });
      if (d.showDecision && l.decision) doc.text(L[l.decision] ?? '', xs[4]! + 4, y, { width: cols[4]!.w * width - 8, align: 'right' });
      y += h + 6;
      doc.moveTo(left, y - 3).lineTo(right, y - 3).strokeColor('#eee').stroke();
    }

    // Totales
    y += 8;
    const tx = left + width * 0.55;
    const tw = width * 0.45;
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10);
      doc.text(label, tx, y, { width: tw * 0.55 });
      doc.text(value, tx + tw * 0.55, y, { width: tw * 0.45, align: 'right' });
      y += bold ? 18 : 15;
    };
    row(L.subtotal, money(d.subtotal));
    if (d.gst || d.qst) {
      row(L.gst, money(d.gst));
      row(L.qst, money(d.qst));
    }
    row(L.total, money(d.total), true);
    if (d.paid !== undefined && d.paid > 0) {
      row(L.paid, money(d.paid));
      row(L.balance, money(d.total - d.paid), true);
    }

    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor('#333');
    if (d.returnParts) {
      doc.text(L.returnParts, left, y, { width });
      y = doc.y + 6;
    }
    if (d.warranty) {
      doc.font('Helvetica-Bold').text(`${L.warranty} : `, left, y, { continued: true }).font('Helvetica').text(d.warranty, { width });
    }
    doc.end();
  });
}

async function common(orderId: string) {
  const s = await one('SELECT * FROM settings WHERE id=1');
  const o = await one<any>(
    `SELECT o.number, o.odometer_in, o.return_parts, c.name, c.address, c.phone, c.email, c.lang, v.make, v.model, v.year, v.plate, v.vin
       FROM orders o JOIN clients c ON c.id=o.client_id JOIN vehicles v ON v.id=o.vehicle_id WHERE o.id=$1`,
    [orderId],
  );
  if (!o) throw notFound();
  return { s, o };
}

function vehicleText(o: any) {
  return [[o.make, o.model, o.year].filter(Boolean).join(' '), o.plate, o.vin && `VIN ${o.vin}`].filter(Boolean).join(' · ');
}

export async function invoicePdf(invoiceId: string, lang?: Lang): Promise<{ buf: Buffer; number: number }> {
  const inv = await one<any>('SELECT * FROM invoices WHERE id=$1', [invoiceId]);
  if (!inv) throw notFound();
  const lines = await q<Line>('SELECT * FROM invoice_lines WHERE invoice_id=$1 ORDER BY position', [invoiceId]);
  const { s, o } = await common(inv.order_id);
  const l: Lang = lang ?? 'fr';
  const L = docLabels[l];
  const buf = await render(
    {
      title: inv.kind === 'inspection' ? L.inspectionInvoice : L.invoice,
      number: String(inv.number),
      date: new Date(inv.issued_at),
      shop: { name: s.shop_name, address: s.shop_address, phone: s.shop_phone, email: s.shop_email },
      client: { name: o.name, address: o.address, phone: o.phone, email: o.email },
      vehicle: vehicleText(o),
      odometer: o.odometer_in,
      orderNumber: o.number,
      lines,
      subtotal: inv.subtotal_cents,
      gst: inv.gst_cents,
      qst: inv.qst_cents,
      total: inv.total_cents,
      paid: inv.paid_cents,
      gstNo: inv.gst_number,
      qstNo: inv.qst_number,
      warranty: inv.kind === 'repair' ? (s.warranty_text[l] ?? inv.warranty_text) : '',
      returnParts: o.return_parts && inv.kind === 'repair',
      showDecision: false,
    },
    l,
  );
  return { buf, number: inv.number };
}

export async function quotePdf(quoteId: string, lang?: Lang): Promise<{ buf: Buffer; name: string }> {
  const qt = await one<any>('SELECT * FROM quotes WHERE id=$1', [quoteId]);
  if (!qt) throw notFound();
  const lines = await q<Line>('SELECT * FROM quote_lines WHERE quote_id=$1 ORDER BY position', [quoteId]);
  const { s, o } = await common(qt.order_id);
  const l: Lang = lang ?? 'fr';
  const buf = await render(
    {
      title: docLabels[l].quote,
      number: `${o.number}-v${qt.version}`,
      date: new Date(qt.sent_at),
      validUntil: new Date(qt.valid_until),
      shop: { name: s.shop_name, address: s.shop_address, phone: s.shop_phone, email: s.shop_email },
      client: { name: o.name, address: o.address, phone: o.phone, email: o.email },
      vehicle: vehicleText(o),
      odometer: o.odometer_in,
      orderNumber: o.number,
      lines,
      subtotal: qt.subtotal_cents,
      gst: qt.gst_cents,
      qst: qt.qst_cents,
      total: qt.total_cents,
      gstNo: s.taxes_registered ? s.gst_number : '',
      qstNo: s.taxes_registered ? s.qst_number : '',
      warranty: '',
      returnParts: false,
      showDecision: qt.status !== 'sent',
    },
    l,
  );
  return { buf, name: `${o.number}-v${qt.version}` };
}
