import { describe, expect, it } from 'vitest';
import { checkEmail, formatLocal7, QC_AREA_CODES, validLocal7 } from './contact';

describe('contacto del cliente', () => {
  it('número local de 7 dígitos', () => {
    expect(validLocal7('555-0142')).toBe(true);
    expect(validLocal7('5550142')).toBe(true);
    expect(validLocal7('555014')).toBe(false);
    expect(validLocal7('55501423')).toBe(false);
    expect(validLocal7('055-0142')).toBe(false);
    expect(formatLocal7('5550142999')).toBe('555-0142');
    expect(QC_AREA_CODES[0]).toBe('514');
  });

  it('correo lógico y errores típicos', () => {
    expect(checkEmail('ana.ruiz@gmail.com')).toBeNull();
    expect(checkEmail('ana@videotron.ca')).toBeNull();
    expect(checkEmail('ana@gmail')).toEqual({ kind: 'invalid' });
    expect(checkEmail('ana gmail.com')).toEqual({ kind: 'invalid' });
    expect(checkEmail('ana@@gmail.com')).toEqual({ kind: 'invalid' });
    expect(checkEmail('ana@gmial.com')).toEqual({ kind: 'typo', suggestion: 'ana@gmail.com' });
    expect(checkEmail('Ana@Hotmail.con')).toEqual({ kind: 'typo', suggestion: 'ana@hotmail.com' });
  });
});
