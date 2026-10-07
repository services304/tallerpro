import { describe, expect, it } from 'vitest';
import { computeTotals, formatMoney, lineTotal, priceWithMargin, roundCents } from '../src/lib/money.js';
import { canTransition, isManualAllowed, manualTargets } from '../src/lib/orderStates.js';
import { formatPhone, normalizePhone } from '../src/lib/phone.js';
import { cleanVin, isValidVinFormat, vinCheckDigitOk } from '../src/lib/vin.js';
import { csvToContacts, guessMapping, parseCsv, parseVcf } from '../src/lib/contacts.js';
import { inQuietHours, nextAllowedTime, localParts } from '../src/lib/time.js';
import { csvSafe } from '../src/lib/security.js';
import { stripJpegExif, sniffMime } from '../src/lib/storage.js';
import { twilioSignature } from '../src/routes/notifications.js';
import { fill, defaultTemplates, LANGS, NOTIFICATION_EVENTS, t } from '../src/lib/i18n.js';

describe('dinero e impuestos de Quebec', () => {
  it('redondea al centavo, mitad hacia arriba', () => {
    expect(roundCents(450.5)).toBe(451);
    expect(roundCents(1.4999999)).toBe(1);
    expect(roundCents(-450.5)).toBe(-451);
  });

  it('calcula TPS 5 % y TVQ 9,975 % sobre el subtotal', () => {
    const t = computeTotals([{ kind: 'fee', quantity: 1, unit_price_cents: 9000 }], true);
    expect(t).toEqual({ subtotal_cents: 9000, gst_cents: 450, qst_cents: 898, total_cents: 10348 });
  });

  it('no cobra impuestos si el taller no está inscrito', () => {
    const t = computeTotals([{ kind: 'labor', quantity: 1.5, unit_price_cents: 9000 }], false);
    expect(t).toEqual({ subtotal_cents: 13500, gst_cents: 0, qst_cents: 0, total_cents: 13500 });
  });

  it('resta los descuentos y nunca da subtotal negativo', () => {
    expect(lineTotal(1, 1000, 'discount')).toBe(-1000);
    const t = computeTotals([{ kind: 'part', quantity: 2, unit_price_cents: 5000 }, { kind: 'discount', quantity: 1, unit_price_cents: 1000 }], true);
    expect(t.subtotal_cents).toBe(9000);
    expect(computeTotals([{ kind: 'discount', quantity: 1, unit_price_cents: 500 }], true).total_cents).toBe(0);
  });

  it('aplica el margen de piezas', () => {
    expect(priceWithMargin(10000, 3000)).toBe(13000);
    expect(priceWithMargin(3333, 2500)).toBe(4166);
  });

  it('formatea montos según el idioma', () => {
    expect(formatMoney(123456, 'en')).toBe('$1,234.56');
    expect(formatMoney(123456, 'fr').replace(/\s/g, ' ')).toBe('1 234,56 $');
  });
});

describe('estados de la orden', () => {
  it('sigue el flujo aprobado: diagnóstico → cotizar repuestos → cotización', () => {
    expect(canTransition('received', 'diagnosis')).toBe(true);
    expect(canTransition('diagnosis', 'parts_quote')).toBe(true);
    expect(canTransition('parts_quote', 'quote_sent')).toBe(true);
    expect(canTransition('quote_sent', 'rejected')).toBe(true);
    expect(canTransition('rejected', 'ready')).toBe(true);
    expect(canTransition('in_repair', 'parts_quote')).toBe(true); // trabajo adicional
  });

  it('impide saltos no permitidos', () => {
    expect(canTransition('received', 'ready')).toBe(false);
    expect(canTransition('closed', 'in_repair')).toBe(false);
  });

  it('el personal no puede aprobar ni cerrar a mano', () => {
    expect(isManualAllowed('quote_sent', 'approved')).toBe(false);
    expect(isManualAllowed('delivered', 'closed')).toBe(false);
    expect(manualTargets('approved')).toEqual(['in_repair', 'waiting_parts']);
  });
});

describe('teléfonos', () => {
  it('normaliza a E.164 (+1 por defecto)', () => {
    expect(normalizePhone('(514) 555-1234')).toBe('+15145551234');
    expect(normalizePhone('1 438 555 0000')).toBe('+14385550000');
    expect(normalizePhone('+57 300 123 4567')).toBe('+573001234567');
    expect(normalizePhone('555-1234')).toBeNull();
    expect(formatPhone('+15145551234')).toBe('(514) 555-1234');
  });
});

describe('VIN', () => {
  it('valida formato y dígito de control', () => {
    expect(cleanVin(' 1hgcm82633a004352 ')).toBe('1HGCM82633A004352');
    expect(isValidVinFormat('1HGCM82633A004352')).toBe(true);
    expect(vinCheckDigitOk('1HGCM82633A004352')).toBe(true);
    expect(vinCheckDigitOk('1HGCM82623A004352')).toBe(false);
    expect(isValidVinFormat('1HGCM82633A00435O')).toBe(false); // O no permitida
  });
});

describe('contactos (WhatsApp / celular)', () => {
  it('lee vCard 3.0 y 2.1 con quoted-printable', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Jean Tremblay', 'N:Tremblay;Jean;;;', 'TEL;TYPE=HOME:514 555 0000', 'TEL;TYPE=CELL:(438) 555-1111', 'EMAIL:Jean@Exemple.ca', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:2.1', 'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Garc=C3=ADa;Jos=C3=A9;;;', 'TEL;CELL:+57 300 123 4567', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'FN:Sin teléfono', 'END:VCARD',
    ].join('\r\n');
    const c = parseVcf(vcf);
    expect(c).toHaveLength(3);
    expect(c[0]).toMatchObject({ name: 'Jean Tremblay', phone: '+14385551111', email: 'jean@exemple.ca' });
    expect(c[1]).toMatchObject({ name: 'José García', phone: '+573001234567' });
    expect(c[2]).toMatchObject({ name: 'Sin teléfono', phone: null });
  });

  it('lee CSV de Google Contacts y Excel en francés (punto y coma)', () => {
    const google = 'First Name,Last Name,Phone 1 - Label,Phone 1 - Value,E-mail 1 - Value\nMarie,Côté,Mobile,514-555-2222 ::: 450-555-3333,marie@x.ca\n';
    const rows = parseCsv(google);
    const m = guessMapping(rows[0]!);
    expect(m).toMatchObject({ first: 0, last: 1, phone: 3, email: 4 });
    expect(csvToContacts(rows.slice(1), m)[0]).toMatchObject({ name: 'Marie Côté', phone: '+15145552222', email: 'marie@x.ca' });

    const fr = '﻿Nom;Téléphone;Courriel\n"Dubé, Luc";514 555 4444;\n';
    const r2 = parseCsv(fr);
    const m2 = guessMapping(r2[0]!);
    expect(csvToContacts(r2.slice(1), m2)[0]).toMatchObject({ name: 'Dubé, Luc', phone: '+15145554444', email: null });
  });
});

describe('horario de silencio (hora de Montreal)', () => {
  it('detecta la noche y reprograma a la mañana', () => {
    const night = new Date('2026-10-07T02:00:00Z'); // 22:00 en Montreal
    expect(inQuietHours(night, 21, 8)).toBe(true);
    const next = nextAllowedTime(night, 21, 8);
    expect(localParts(next).h).toBe(8);
    const day = new Date('2026-10-07T16:00:00Z'); // 12:00
    expect(inQuietHours(day, 21, 8)).toBe(false);
    expect(nextAllowedTime(day, 21, 8)).toEqual(day);
  });
});

describe('seguridad', () => {
  it('neutraliza fórmulas en CSV', () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvSafe('+1 514')).toBe("'+1 514");
    expect(csvSafe('@SUM')).toBe("'@SUM");
    expect(csvSafe('Normal')).toBe('Normal');
  });

  it('quita los metadatos EXIF (GPS) de un JPEG', () => {
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, 0x08]), Buffer.from('Exif\0\0')]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xdb, 0x00, 0x03, 0x01]), sos]);
    const out = stripJpegExif(jpeg);
    expect(out.includes(Buffer.from('Exif'))).toBe(false);
    expect(out.subarray(-8)).toEqual(sos);
    expect(sniffMime(Buffer.concat([out, Buffer.alloc(8)]))).toBe('image/jpeg');
  });

  it('calcula la firma de Twilio como la documenta Twilio', () => {
    // Valor verificado con getExpectedTwilioSignature() de la librería oficial «twilio».
    const sig = twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', {
      CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212',
    });
    expect(sig).toBe('0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
  });
});

describe('idiomas', () => {
  it('cada evento tiene plantilla en FR, EN y ES', () => {
    for (const l of LANGS) for (const e of NOTIFICATION_EVENTS) expect(defaultTemplates[l][e].body.length).toBeGreaterThan(10);
  });
  it('traduce los mensajes del servidor', () => {
    expect(t('es', 'auth.locked', { minutes: 15 })).toContain('15 min');
    expect(t('en', 'auth.invalid')).toBe('Incorrect email or password.');
    expect(t('fr', 'auth.invalid')).toBe('Courriel ou mot de passe incorrect.');
    expect(fill('Hola {name}, {missing}', { name: 'Ana' })).toBe('Hola Ana, ');
  });
});
