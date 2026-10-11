/**
 * Cómo dibujar un vehículo de forma genérica: tipo de carrocería (por modelo) y color (por el nombre escrito).
 * No usa fotos de fabricantes: es una silueta propia pintada del color del carro.
 */
export type BodyType = 'sedan' | 'hatchback' | 'suv' | 'pickup' | 'minivan' | 'van' | 'coupe' | 'wagon';

const BY_MODEL: [BodyType, string[]][] = [
  ['pickup', ['f-150', 'f-250', 'f-350', 'silverado', 'sierra', 'ram', '1500', '2500', '3500', 'tacoma', 'tundra', 'ranger', 'colorado', 'canyon', 'frontier', 'titan', 'ridgeline', 'maverick', 'gladiator', 'santa cruz', 'cybertruck', 'avalanche', 'dakota']],
  ['van', ['transit', 'sprinter', 'promaster', 'express', 'savana', 'e-series', 'metris']],
  ['minivan', ['sienna', 'odyssey', 'grand caravan', 'pacifica', 'carnival', 'sedona', 'town & country', 'uplander', 'montana', 'mazda5', 'orlando', 'rondo']],
  ['coupe', ['mustang', 'camaro', 'challenger', 'corvette', '911', 'brz', 'mx-5', 'fr-s', 'z4', 'tt', 'tc', 'cr-z', 'série 2', 'série 4', 'q60', 'g37', 'beetle']],
  ['wagon', ['outback', 'v60', 'v90', 'golf sportwagen', 'mazda6 wagon']],
  ['hatchback', ['fit', 'yaris', 'golf', 'gti', 'mazda2', 'mazda3 sport', 'accent', 'rio', 'soul', 'spark', 'sonic', 'aveo', 'versa note', 'micra', 'mirage', 'bolt', 'leaf', 'prius', 'veloster', 'elantra gt', 'impreza', 'crosstrek', 'mini', 'cooper', 'fiesta', 'focus', 'c-max', 'matrix', 'vibe', 'xb', 'xd', 'im', 'i3', 'fortwo', '500', 'swift', 'insight', 'niro', 'ioniq', 'kona', 'venue', 'juke', 'kicks', 'rvr', 'model 3', 'model s']],
  ['suv', [
    'cr-v', 'hr-v', 'pilot', 'passport', 'prologue', 'element', 'rav4', 'highlander', '4runner', 'sequoia', 'venza', 'c-hr', 'corolla cross', 'bz4x',
    'cx-', 'escape', 'edge', 'explorer', 'expedition', 'bronco', 'flex', 'mach-e', 'equinox', 'traverse', 'tahoe', 'suburban', 'blazer', 'trax',
    'trailblazer', 'captiva', 'terrain', 'acadia', 'yukon', 'hummer', 'rogue', 'murano', 'pathfinder', 'qashqai', 'x-trail', 'ariya', 'tucson',
    'santa fe', 'palisade', 'ioniq 5', 'sportage', 'sorento', 'telluride', 'seltos', 'ev6', 'ev9', 'forester', 'ascent', 'solterra', 'outlander',
    'eclipse cross', 'cherokee', 'compass', 'renegade', 'patriot', 'liberty', 'wrangler', 'wagoneer', 'durango', 'journey', 'nitro', 'hornet',
    'tiguan', 'atlas', 'taos', 'touareg', 'id.4', 'xc', 'c40', 'q3', 'q4', 'q5', 'q7', 'q8', 'e-tron', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'ix',
    'gla', 'glb', 'glc', 'gle', 'gls', 'eqb', 'rdx', 'mdx', 'zdx', 'rx', 'nx', 'ux', 'gx', 'lx', 'rz', 'qx', 'xt4', 'xt5', 'xt6', 'escalade', 'srx',
    'lyriq', 'encore', 'enclave', 'envision', 'envista', 'aviator', 'corsair', 'mkc', 'mkx', 'nautilus', 'navigator', 'gv', 'stelvio', 'tonale',
    'cayenne', 'macan', 'model x', 'model y', 'defender', 'discovery', 'range rover', 'e-pace', 'f-pace', 'i-pace', 'clubman', 'countryman',
    'torrent', 'vue', 'outlook', 'grand vitara', 'sx4', 'polestar 3', 'tribute', 'equator',
  ]],
];

export function bodyTypeOf(make: string | null | undefined, model: string | null | undefined): BodyType {
  const m = (model ?? '').toLowerCase().trim();
  if (!m) return 'sedan';
  // Coincidencia exacta primero (p. ej. «Ioniq 5» es SUV aunque «Ioniq» sea hatchback).
  for (const [type, names] of BY_MODEL) if (names.includes(m)) return type;
  for (const [type, names] of BY_MODEL) if (names.some((n) => n.length >= 3 && m.includes(n))) return type;
  if ((make ?? '').toLowerCase() === 'ram') return 'pickup';
  return 'sedan';
}

const COLORS: [string[], string][] = [
  [['blanc', 'blanco', 'white', 'blanche', 'nacar', 'perla', 'pearl'], '#eceeef'],
  [['negro', 'noir', 'black', 'noire'], '#22262a'],
  [['plata', 'plateado', 'argent', 'silver'], '#b8bec4'],
  [['gris', 'grey', 'gray', 'grise', 'charcoal', 'grafito', 'graphite'], '#7d848b'],
  [['rojo', 'rouge', 'red', 'vino', 'bordeaux', 'burgundy', 'granate'], '#b8282c'],
  [['azul', 'bleu', 'blue', 'marino', 'navy'], '#2a5aa8'],
  [['verde', 'vert', 'green'], '#2f7a4b'],
  [['amarillo', 'jaune', 'yellow'], '#e7b81a'],
  [['naranja', 'orange', 'anaranjado'], '#e0731e'],
  [['café', 'cafe', 'marrón', 'marron', 'brun', 'brown', 'chocolate'], '#6b4a33'],
  [['beige', 'crema', 'champagne', 'arena', 'sable'], '#d8c7a3'],
  [['dorado', 'or', 'gold', 'doré'], '#c9a54a'],
  [['morado', 'violeta', 'púrpura', 'violet', 'purple', 'mauve'], '#6a3f8f'],
];

/** Color del texto escrito («Gris», «rouge», «Blue»…). Si no se reconoce, gris neutro. */
export function paintOf(color: string | null | undefined): { fill: string; known: boolean } {
  const c = (color ?? '').toLowerCase();
  if (c) for (const [words, hex] of COLORS) if (words.some((w) => new RegExp(`(^|[^a-zà-ÿ])${w}([^a-zà-ÿ]|$)`).test(c))) return { fill: hex, known: true };
  return { fill: '#9aa1a8', known: false };
}
