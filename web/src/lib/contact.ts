/** Códigos de área de Canadá: primero los de Quebec. */
export const QC_AREA_CODES = ['514', '438', '263', '450', '579', '354', '418', '581', '367', '819', '873', '468'];
export const OTHER_CA_AREA_CODES = [
  '204', '226', '236', '249', '250', '289', '306', '343', '365', '368', '382', '387', '403', '416', '428', '431', '437', '474', '506', '519',
  '548', '584', '587', '604', '613', '639', '647', '672', '683', '705', '709', '742', '753', '778', '780', '782', '807', '825', '867', '879',
  '902', '905', '942',
];

/** Número local: exactamente 7 dígitos, sin empezar por 0 o 1 (regla norteamericana). */
export function validLocal7(v: string) {
  const d = v.replace(/\D/g, '');
  return d.length === 7 && !/^[01]/.test(d);
}

/** «5550142» → «555-0142» mientras se escribe. */
export function formatLocal7(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 7);
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}

const DOMAIN_FIXES: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gnail.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com',
  'videotron.qc': 'videotron.ca', 'videotron.com': 'videotron.ca', 'sympatico.com': 'sympatico.ca',
};

/** Revisa que el correo tenga sentido. Devuelve null si está bien, o el error y una sugerencia. */
export function checkEmail(raw: string): null | { kind: 'invalid' } | { kind: 'typo'; suggestion: string } {
  const e = raw.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) || e.includes('..')) return { kind: 'invalid' };
  const [user, domain] = e.split('@') as [string, string];
  const fix = DOMAIN_FIXES[domain];
  if (fix) return { kind: 'typo', suggestion: `${user}@${fix}` };
  return null;
}
