import { bodyTypeOf, paintOf, type BodyType } from '../lib/carLook';

/** Siluetas laterales propias (sin fotos de fabricantes), con la trompa hacia la derecha. */
const SHAPES: Record<BodyType, { body: string; windows: string[]; wheels: [number, number]; extra?: string[]; light: [number, number]; tail: [number, number] }> = {
  sedan: {
    body: 'M14,82 C14,72 18,66 30,64 L74,58 C90,42 104,36 124,35 L160,35 C176,36 190,46 204,58 L234,62 C243,64 246,70 246,78 L246,84 C246,87 243,88 240,88 L217,88 A21,21 0 0 0 175,88 L83,88 A21,21 0 0 0 41,88 L20,88 C16,88 14,86 14,82 Z',
    windows: ['M82,58 C95,46 107,40 124,40 L136,40 L136,58 Z', 'M141,40 L158,40 C172,41 184,49 195,58 L141,58 Z'],
    wheels: [62, 196],
    light: [236, 66],
    tail: [16, 68],
  },
  hatchback: {
    body: 'M28,84 L28,58 C28,52 32,48 38,46 L58,42 C70,30 82,26 100,26 L140,26 C156,27 168,38 180,52 L214,58 C222,60 228,65 228,72 L228,84 C228,87 226,88 223,88 L211,88 A21,21 0 0 0 169,88 L91,88 A21,21 0 0 0 49,88 L32,88 C29,88 28,87 28,84 Z',
    windows: ['M46,50 C52,40 64,32 84,31 L112,31 L112,52 L46,52 Z', 'M117,31 L138,31 C152,32 162,41 172,52 L117,52 Z'],
    wheels: [70, 190],
    light: [218, 62],
    tail: [30, 56],
  },
  suv: {
    body: 'M14,84 L14,62 C14,56 18,52 26,51 L40,50 L58,28 C61,24 65,22 71,22 L170,22 C178,22 183,25 188,30 L206,50 L236,54 C243,55 246,60 246,66 L246,84 C246,87 244,88 241,88 L218,88 A22,22 0 0 0 174,88 L86,88 A22,22 0 0 0 42,88 L19,88 C16,88 14,87 14,84 Z',
    windows: ['M48,50 L62,30 C64,28 66,27 69,27 L104,27 L104,50 Z', 'M109,27 L140,27 L140,50 L109,50 Z', 'M145,27 L168,27 C173,27 176,29 179,32 L196,50 L145,50 Z'],
    wheels: [64, 196],
    light: [237, 58],
    tail: [16, 56],
  },
  pickup: {
    body: 'M12,84 L12,56 C12,53 14,52 17,52 L96,52 L100,26 C101,23 104,22 107,22 L156,22 C163,22 168,25 172,30 L190,52 L234,56 C242,57 247,62 247,70 L247,84 C247,87 245,88 242,88 L222,88 A22,22 0 0 0 178,88 L84,88 A22,22 0 0 0 40,88 L17,88 C14,88 12,87 12,84 Z',
    windows: ['M106,28 L130,28 L130,51 L102,51 Z', 'M135,28 L155,28 C160,28 164,30 167,34 L181,51 L135,51 Z'],
    extra: ['M96,52 L96,86'],
    wheels: [62, 200],
    light: [238, 60],
    tail: [13, 58],
  },
  minivan: {
    body: 'M14,84 L14,40 C14,30 20,24 30,24 L150,24 C166,24 176,30 188,42 L204,54 L234,58 C242,59 246,64 246,70 L246,84 C246,87 244,88 241,88 L220,88 A22,22 0 0 0 176,88 L86,88 A22,22 0 0 0 42,88 L19,88 C16,88 14,87 14,84 Z',
    windows: ['M22,32 C22,30 24,29 26,29 L72,29 L72,52 L22,52 Z', 'M77,29 L132,29 L132,52 L77,52 Z', 'M137,29 L152,29 C162,29 170,34 178,42 L190,52 L137,52 Z'],
    extra: ['M134,55 L134,86'],
    wheels: [64, 198],
    light: [236, 62],
    tail: [16, 50],
  },
  van: {
    body: 'M12,84 L12,22 C12,18 14,16 18,16 L176,16 C184,16 190,20 194,26 L208,52 L236,56 C243,57 247,62 247,70 L247,84 C247,87 245,88 242,88 L222,88 A22,22 0 0 0 178,88 L84,88 A22,22 0 0 0 40,88 L17,88 C14,88 12,87 12,84 Z',
    windows: ['M162,22 L178,22 C183,22 186,24 189,28 L200,50 L162,50 Z'],
    extra: ['M158,18 L158,86', 'M100,18 L100,86'],
    wheels: [62, 200],
    light: [238, 60],
    tail: [13, 40],
  },
  coupe: {
    body: 'M16,82 C16,74 20,70 30,68 L84,60 C100,44 116,38 134,38 L158,38 C176,40 192,50 206,60 L236,64 C243,66 246,71 246,78 L246,84 C246,87 244,88 241,88 L215,88 A21,21 0 0 0 173,88 L85,88 A21,21 0 0 0 43,88 L21,88 C18,88 16,86 16,82 Z',
    windows: ['M92,60 C104,48 118,43 136,43 L156,43 C172,44 184,51 196,60 Z'],
    wheels: [64, 194],
    light: [237, 68],
    tail: [18, 72],
  },
  wagon: {
    body: 'M14,84 L14,60 C14,54 18,50 26,48 L40,46 L52,34 C55,31 58,30 62,30 L156,30 C170,31 182,40 196,52 L234,58 C242,60 246,65 246,72 L246,84 C246,87 244,88 241,88 L217,88 A21,21 0 0 0 175,88 L83,88 A21,21 0 0 0 41,88 L19,88 C16,88 14,87 14,84 Z',
    windows: ['M46,48 L56,37 C58,35 60,35 63,35 L100,35 L100,52 L46,52 Z', 'M105,35 L134,35 L134,52 L105,52 Z', 'M139,35 L154,35 C166,36 175,43 186,52 L139,52 Z'],
    wheels: [62, 196],
    light: [236, 62],
    tail: [16, 56],
  },
};

/**
 * Dibujo genérico del vehículo del cliente: tipo de carrocería según el modelo y pintado de su color.
 * Sin fondo (transparente), para mostrar al elegir el vehículo.
 */
export function CarSilhouette({
  make,
  model,
  color,
  width = 160,
  title,
}: {
  make?: string | null;
  model?: string | null;
  color?: string | null;
  width?: number;
  title?: string;
}) {
  const type = bodyTypeOf(make, model);
  const s = SHAPES[type];
  const { fill } = paintOf(color);
  // Colores oscuros: borde claro para que se vean sobre el fondo oscuro de la app.
  const lum = (() => {
    const n = parseInt(fill.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  })();
  const edge = lum < 0.3 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.45)';
  const label = title ?? [make, model, color].filter(Boolean).join(' ');
  return (
    <svg className="car-svg" viewBox="0 0 260 110" width={width} height={(width * 110) / 260} role="img" aria-label={label} data-body={type}>
      <title>{label}</title>
      <ellipse cx="130" cy="104" rx="118" ry="4.5" fill="#000" opacity="0.22" />
      <path d={s.body} fill={fill} stroke={edge} strokeWidth="1.6" strokeLinejoin="round" />
      {/* reflejo suave sobre la carrocería */}
      <path d={s.body} fill="url(#car-shine)" opacity="0.5" />
      {s.windows.map((w, i) => (
        <path key={i} d={w} fill="#1f2a33" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      ))}
      {s.extra?.map((e, i) => <path key={`x${i}`} d={e} stroke="rgba(0,0,0,0.35)" strokeWidth="1.4" fill="none" />)}
      <rect x={s.light[0]} y={s.light[1]} width="8" height="5" rx="2" fill="#fff6c8" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      <rect x={s.tail[0]} y={s.tail[1]} width="5" height="7" rx="1.5" fill="#d23a2a" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
      {s.wheels.map((x) => (
        <g key={x}>
          <circle cx={x} cy="86" r="17.5" fill="#16181b" />
          <circle cx={x} cy="86" r="9.5" fill="#9aa0a6" />
          <circle cx={x} cy="86" r="3.2" fill="#474c52" />
        </g>
      ))}
      <defs>
        <linearGradient id="car-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
    </svg>
  );
}
