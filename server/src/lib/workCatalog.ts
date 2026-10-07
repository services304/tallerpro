/**
 * Trabajos comunes con un precio sugerido de MANO DE OBRA (las piezas se cobran aparte).
 *
 * Referencia: un taller independiente en Montreal cobra entre 85 y 120 $ por hora (Expert Zoom, marzo de 2026).
 * Cada precio = horas típicas del trabajo × ~100–110 $/h, redondeado. Son puntos de partida: el dueño los ajusta.
 */
import type { Lang } from './i18n.js';

export type WorkCategory = 'maintenance' | 'tires' | 'brakes' | 'electrical' | 'engine' | 'suspension' | 'exhaust' | 'climate' | 'other';

export interface SuggestedWork {
  key: string;
  category: WorkCategory;
  names: Record<Lang, string>;
  mode: 'fixed' | 'hourly';
  price: number; // dólares
  minutes: number;
}

export const SUGGESTED_WORK: SuggestedWork[] = [
  // Mantenimiento
  { key: 'oil-change', category: 'maintenance', mode: 'fixed', price: 45, minutes: 30, names: { fr: "Vidange d'huile et changement du filtre", en: 'Oil and filter change', es: 'Cambio de aceite y filtro' } },
  { key: 'inspection', category: 'maintenance', mode: 'fixed', price: 75, minutes: 45, names: { fr: 'Inspection générale du véhicule', en: 'General vehicle inspection', es: 'Inspección general del vehículo' } },
  { key: 'engine-air-filter', category: 'maintenance', mode: 'fixed', price: 25, minutes: 15, names: { fr: 'Remplacement du filtre à air moteur', en: 'Engine air filter replacement', es: 'Cambio del filtro de aire del motor' } },
  { key: 'cabin-filter', category: 'maintenance', mode: 'fixed', price: 35, minutes: 20, names: { fr: "Remplacement du filtre d'habitacle", en: 'Cabin air filter replacement', es: 'Cambio del filtro de habitáculo' } },
  { key: 'wipers', category: 'maintenance', mode: 'fixed', price: 20, minutes: 10, names: { fr: "Remplacement des balais d'essuie-glace", en: 'Wiper blade replacement', es: 'Cambio de plumillas limpiaparabrisas' } },
  { key: 'spark-plugs', category: 'maintenance', mode: 'fixed', price: 110, minutes: 60, names: { fr: "Remplacement des bougies d'allumage (4 cylindres)", en: 'Spark plug replacement (4-cylinder)', es: 'Cambio de bujías (4 cilindros)' } },
  { key: 'coolant-flush', category: 'maintenance', mode: 'fixed', price: 110, minutes: 60, names: { fr: 'Vidange du liquide de refroidissement', en: 'Coolant flush', es: 'Cambio del líquido refrigerante' } },
  { key: 'brake-fluid', category: 'maintenance', mode: 'fixed', price: 110, minutes: 60, names: { fr: 'Purge et remplacement du liquide de frein', en: 'Brake fluid flush', es: 'Purga y cambio del líquido de frenos' } },
  { key: 'atf', category: 'maintenance', mode: 'fixed', price: 120, minutes: 60, names: { fr: "Vidange de l'huile de transmission automatique", en: 'Automatic transmission fluid change', es: 'Cambio de aceite de transmisión automática' } },
  // Neumáticos
  { key: 'seasonal-tires', category: 'tires', mode: 'fixed', price: 80, minutes: 45, names: { fr: 'Changement de pneus saisonnier (4 roues sur jantes)', en: 'Seasonal tire swap (4 mounted wheels)', es: 'Cambio de llantas de temporada (4 ruedas con rin)' } },
  { key: 'tire-rotation', category: 'tires', mode: 'fixed', price: 45, minutes: 30, names: { fr: 'Permutation des pneus', en: 'Tire rotation', es: 'Rotación de llantas' } },
  { key: 'flat-repair', category: 'tires', mode: 'fixed', price: 40, minutes: 30, names: { fr: "Réparation d'une crevaison", en: 'Flat tire repair', es: 'Reparación de pinchazo' } },
  // Frenos
  { key: 'pads-front', category: 'brakes', mode: 'fixed', price: 120, minutes: 60, names: { fr: 'Remplacement des plaquettes de frein avant', en: 'Front brake pad replacement', es: 'Cambio de pastillas de freno delanteras' } },
  { key: 'pads-rear', category: 'brakes', mode: 'fixed', price: 120, minutes: 60, names: { fr: 'Remplacement des plaquettes de frein arrière', en: 'Rear brake pad replacement', es: 'Cambio de pastillas de freno traseras' } },
  { key: 'pads-rotors-front', category: 'brakes', mode: 'fixed', price: 180, minutes: 90, names: { fr: 'Plaquettes et disques de frein avant', en: 'Front brake pads and rotors', es: 'Pastillas y discos de freno delanteros' } },
  { key: 'pads-rotors-rear', category: 'brakes', mode: 'fixed', price: 180, minutes: 90, names: { fr: 'Plaquettes et disques de frein arrière', en: 'Rear brake pads and rotors', es: 'Pastillas y discos de freno traseros' } },
  { key: 'caliper', category: 'brakes', mode: 'fixed', price: 120, minutes: 60, names: { fr: "Remplacement d'un étrier de frein", en: 'Brake caliper replacement (one)', es: 'Cambio de una mordaza (caliper) de freno' } },
  // Eléctrico
  { key: 'diagnostic', category: 'electrical', mode: 'fixed', price: 110, minutes: 60, names: { fr: 'Diagnostic électronique approfondi', en: 'In-depth electronic diagnosis', es: 'Diagnóstico electrónico a fondo' } },
  { key: 'battery', category: 'electrical', mode: 'fixed', price: 50, minutes: 30, names: { fr: 'Remplacement de la batterie et test de charge', en: 'Battery replacement and charging test', es: 'Cambio de batería y prueba de carga' } },
  { key: 'alternator', category: 'electrical', mode: 'fixed', price: 230, minutes: 120, names: { fr: "Remplacement de l'alternateur", en: 'Alternator replacement', es: 'Cambio del alternador' } },
  { key: 'starter', category: 'electrical', mode: 'fixed', price: 180, minutes: 90, names: { fr: 'Remplacement du démarreur', en: 'Starter replacement', es: 'Cambio del motor de arranque' } },
  { key: 'headlight-bulb', category: 'electrical', mode: 'fixed', price: 30, minutes: 20, names: { fr: "Remplacement d'une ampoule de phare", en: 'Headlight bulb replacement', es: 'Cambio de bombillo del faro' } },
  // Motor
  { key: 'serpentine-belt', category: 'engine', mode: 'fixed', price: 120, minutes: 60, names: { fr: "Remplacement de la courroie d'accessoires", en: 'Serpentine belt replacement', es: 'Cambio de la correa de accesorios' } },
  { key: 'timing-belt', category: 'engine', mode: 'fixed', price: 550, minutes: 270, names: { fr: 'Courroie de distribution et pompe à eau', en: 'Timing belt and water pump', es: 'Correa de distribución y bomba de agua' } },
  { key: 'thermostat', category: 'engine', mode: 'fixed', price: 170, minutes: 90, names: { fr: 'Remplacement du thermostat', en: 'Thermostat replacement', es: 'Cambio del termostato' } },
  { key: 'water-pump', category: 'engine', mode: 'fixed', price: 330, minutes: 180, names: { fr: 'Remplacement de la pompe à eau', en: 'Water pump replacement', es: 'Cambio de la bomba de agua' } },
  // Suspensión y dirección
  { key: 'struts-front', category: 'suspension', mode: 'fixed', price: 230, minutes: 120, names: { fr: 'Remplacement des amortisseurs avant (paire)', en: 'Front struts replacement (pair)', es: 'Cambio de amortiguadores delanteros (par)' } },
  { key: 'tie-rod', category: 'suspension', mode: 'fixed', price: 120, minutes: 60, names: { fr: "Remplacement d'un embout de direction", en: 'Tie rod end replacement (one)', es: 'Cambio de un terminal de dirección' } },
  { key: 'sway-link', category: 'suspension', mode: 'fixed', price: 80, minutes: 45, names: { fr: "Remplacement d'une biellette stabilisatrice", en: 'Sway bar link replacement (one)', es: 'Cambio de un tornillo estabilizador' } },
  { key: 'wheel-bearing', category: 'suspension', mode: 'fixed', price: 180, minutes: 90, names: { fr: "Remplacement d'un roulement de roue", en: 'Wheel bearing replacement (one)', es: 'Cambio de un rodamiento de rueda' } },
  // Escape y clima
  { key: 'muffler', category: 'exhaust', mode: 'fixed', price: 120, minutes: 60, names: { fr: 'Remplacement du silencieux', en: 'Muffler replacement', es: 'Cambio del silenciador' } },
  { key: 'ac-recharge', category: 'climate', mode: 'fixed', price: 120, minutes: 60, names: { fr: 'Recharge de la climatisation', en: 'A/C recharge', es: 'Recarga del aire acondicionado' } },
  // Por hora
  { key: 'labour-hourly', category: 'other', mode: 'hourly', price: 100, minutes: 60, names: { fr: "Main-d'œuvre générale (à l'heure)", en: 'General labour (hourly)', es: 'Mano de obra general (por hora)' } },
];

/** Inserta los trabajos sugeridos que falten (no toca los que el dueño ya editó). Devuelve cuántos agregó. */
export async function addSuggestedWork(db: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }> }): Promise<number> {
  let n = 0;
  for (const w of SUGGESTED_WORK) {
    const r = await db.query(
      `INSERT INTO work_types (name, names, category, mode, price_cents, est_minutes, suggested_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (suggested_key) WHERE suggested_key IS NOT NULL DO NOTHING`,
      [w.names.fr, JSON.stringify(w.names), w.category, w.mode, w.price * 100, w.minutes, w.key],
    );
    n += r.rowCount ?? 0;
  }
  return n;
}
