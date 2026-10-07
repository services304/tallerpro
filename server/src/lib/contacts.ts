/** Lectura de contactos exportados del celular (vCard .vcf) o de una hoja (CSV). */
import { normalizePhone } from './phone.js';

export interface RawContact {
  name: string;
  phone: string | null;
  phoneRaw: string;
  email: string | null;
  note: string;
}

function decodeQP(s: string): string {
  const bytes: number[] = [];
  const clean = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < clean.length; i++) {
    if (clean[i] === '=' && /^[0-9A-F]{2}$/i.test(clean.slice(i + 1, i + 3))) {
      bytes.push(parseInt(clean.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(clean.charCodeAt(i));
  }
  return Buffer.from(bytes).toString('utf8');
}

function unescapeV(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

export function parseVcf(text: string): RawContact[] {
  // Desdoblar líneas (RFC 6350) y las continuaciones quoted-printable (vCard 2.1).
  const raw = text.replace(/\r\n/g, '\n').replace(/=\n/g, '').split('\n');
  const lines: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && lines.length) lines[lines.length - 1] += l.slice(1);
    else lines.push(l);
  }
  const out: RawContact[] = [];
  let cur: { fn?: string; n?: string; tels: { v: string; cell: boolean }[]; emails: string[]; note: string } | null = null;
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VCARD')) {
      cur = { tels: [], emails: [], note: '' };
      continue;
    }
    if (upper.startsWith('END:VCARD')) {
      if (cur) {
        let name = cur.fn?.trim() ?? '';
        if (!name && cur.n) {
          const [last = '', first = '', middle = ''] = cur.n.split(';');
          name = [first, middle, last].filter(Boolean).join(' ').trim();
        }
        const tel = cur.tels.find((t) => t.cell) ?? cur.tels[0];
        out.push({ name, phoneRaw: tel?.v ?? '', phone: normalizePhone(tel?.v), email: cur.emails[0]?.toLowerCase() ?? null, note: cur.note });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    let value = line.slice(idx + 1);
    const [prop, ...params] = head.split(';');
    const key = prop!.split('.').pop()!.toUpperCase();
    const p = params.join(';').toUpperCase();
    if (p.includes('QUOTED-PRINTABLE')) value = decodeQP(value);
    value = unescapeV(value);
    if (key === 'FN') cur.fn = value;
    else if (key === 'N') cur.n = value;
    else if (key === 'TEL') cur.tels.push({ v: value.replace(/^tel:/i, ''), cell: /CELL|MOBILE/.test(p) });
    else if (key === 'EMAIL') cur.emails.push(value.trim());
    else if (key === 'NOTE') cur.note = value.slice(0, 1000);
  }
  return out.filter((c) => c.name || c.phone || c.email);
}

/** CSV con comillas (RFC 4180), separador coma o punto y coma (Excel en francés). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQ) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

export interface CsvMapping {
  name?: number;
  first?: number;
  last?: number;
  phone?: number;
  email?: number;
  note?: number;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Adivina qué columna es cada dato (Google Contacts, Outlook, Excel en FR/EN/ES). */
export function guessMapping(headers: string[]): CsvMapping {
  const h = headers.map(norm);
  const find = (tests: ((x: string) => boolean)[]) => {
    for (const test of tests) {
      const i = h.findIndex(test);
      if (i >= 0) return i;
    }
    return undefined;
  };
  return {
    name: find([(x) => ['name', 'nom', 'nombre', 'full name', 'display name', 'nom complet', 'nombre completo', 'client', 'cliente'].includes(x)]),
    first: find([(x) => ['first name', 'given name', 'prenom', 'nombre de pila'].includes(x)]),
    last: find([(x) => ['last name', 'family name', 'nom de famille', 'apellido', 'apellidos', 'surname'].includes(x)]),
    phone: find([
      (x) => /(phone|telephone|telefono|mobile|cell|celular|movil)/.test(x) && /value|valeur|valor/.test(x),
      (x) => /(mobile|cell|celular|movil)/.test(x),
      (x) => /(phone|telephone|telefono|tel)/.test(x),
    ]),
    email: find([(x) => /(mail|courriel|correo)/.test(x) && /value|valeur|valor/.test(x), (x) => /(mail|courriel|correo)/.test(x)]),
    note: find([(x) => ['notes', 'note', 'nota', 'notas', 'remarques'].includes(x)]),
  };
}

export function csvToContacts(rows: string[][], mapping: CsvMapping): RawContact[] {
  return rows.map((r) => {
    const get = (i?: number) => (i === undefined ? '' : (r[i] ?? '').trim());
    // Google Contacts junta varios teléfonos con « ::: »
    const phoneRaw = get(mapping.phone).split(':::')[0]!.trim();
    const email = get(mapping.email).split(':::')[0]!.trim().toLowerCase();
    const name = get(mapping.name) || [get(mapping.first), get(mapping.last)].filter(Boolean).join(' ');
    return { name, phoneRaw, phone: normalizePhone(phoneRaw), email: email || null, note: get(mapping.note).slice(0, 1000) };
  }).filter((c) => c.name || c.phone || c.email);
}
