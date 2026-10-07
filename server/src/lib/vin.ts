/** Validación y decodificación de VIN (17 caracteres, América del Norte). */

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function cleanVin(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidVinFormat(v: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

/** Dígito de control (posición 9). Obligatorio en vehículos de América del Norte. */
export function vinCheckDigitOk(v: string): boolean {
  if (!isValidVinFormat(v)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v[i]!;
    const val = /\d/.test(c) ? Number(c) : TRANSLIT[c]!;
    sum += val * WEIGHTS[i]!;
  }
  const r = sum % 11;
  return v[8] === (r === 10 ? 'X' : String(r));
}

export interface VinInfo {
  make: string;
  model: string;
  year: number | null;
  engine: string;
}

/** Decodifica con la API pública vPIC de la NHTSA. Devuelve null si no responde. */
export async function decodeVin(vin: string, fetchImpl: typeof fetch = fetch): Promise<VinInfo | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetchImpl(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { Results?: Record<string, string>[] };
    const x = j.Results?.[0];
    if (!x || !x.Make) return null;
    const engine = [x.DisplacementL ? `${Number(x.DisplacementL).toFixed(1)} L` : '', x.EngineCylinders ? `${x.EngineCylinders} cyl` : '', x.FuelTypePrimary ?? '']
      .filter(Boolean)
      .join(' · ');
    return {
      make: titleCase(x.Make),
      model: x.Model ?? '',
      year: x.ModelYear ? Number(x.ModelYear) : null,
      engine,
    };
  } catch {
    return null;
  }
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
