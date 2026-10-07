import { useI18n, type Key } from '../i18n';

/** Vista desde arriba del carro: se toca la zona dañada. */
const ZONES: { key: string; d: string; lx: number; ly: number }[] = [
  { key: 'front', d: 'M50 6 h100 a24 24 0 0 1 24 24 v8 H26 v-8 a24 24 0 0 1 24 -24z', lx: 100, ly: 26 },
  { key: 'hood', d: 'M44 42 h112 v76 H44z', lx: 100, ly: 84 },
  { key: 'windshield', d: 'M48 122 h104 l-8 30 H56z', lx: 100, ly: 141 },
  { key: 'roof', d: 'M56 156 h88 v84 H56z', lx: 100, ly: 202 },
  { key: 'trunk', d: 'M48 244 h104 v66 H48z', lx: 100, ly: 281 },
  { key: 'rear', d: 'M26 314 h148 v14 a24 24 0 0 1 -24 24 H50 a24 24 0 0 1 -24 -24z', lx: 100, ly: 336 },
  { key: 'front-left', d: 'M6 42 h34 v118 H6z', lx: 23, ly: 104 },
  { key: 'rear-left', d: 'M6 164 h34 v146 H6z', lx: 23, ly: 240 },
  { key: 'front-right', d: 'M160 42 h34 v118 h-34z', lx: 177, ly: 104 },
  { key: 'rear-right', d: 'M160 164 h34 v146 h-34z', lx: 177, ly: 240 },
];

export function CarMap({ hits, onPick }: { hits: string[]; onPick: (zone: string) => void }) {
  const { t } = useI18n();
  return (
    <svg className="carmap" viewBox="0 0 200 358" role="group" aria-label={t('intake.damages')}>
      {ZONES.map((z) => (
        <g key={z.key}>
          <path
            d={z.d}
            className={`zone${hits.includes(z.key) ? ' hit' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={t(`intake.zone.${z.key}` as Key)}
            aria-pressed={hits.includes(z.key)}
            onClick={() => onPick(z.key)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPick(z.key))}
          />
          {!z.key.includes('-') && (
            <text x={z.lx} y={z.ly + 4} textAnchor="middle">
              {t(`intake.zone.${z.key}` as Key)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
