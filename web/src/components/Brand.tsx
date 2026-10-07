/**
 * Identidad de Mécanicien El Cabo, según su guía de marca:
 * emblema circular (con aro claro sobre fondo oscuro) + «MÉCANICIEN / EL CABO / Famille sur roues».
 */
export const BRAND = {
  kicker: 'Mécanicien',
  name: 'El Cabo',
  tagline: 'Famille sur roues',
};

export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  const src = size > 96 ? '/logo-384.webp' : '/logo-96.webp';
  return <img className={`logo ${className}`} src={src} width={size} height={size} alt={`${BRAND.kicker} ${BRAND.name}`} />;
}

/** Bloque de marca completo: emblema + nombre + lema. */
export function Lockup({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className={`lockup lockup-${size}`}>
      <Logo size={size === 'lg' ? 112 : 64} />
      <div className="lockup-text">
        <span className="lockup-kicker">{BRAND.kicker}</span>
        <span className="lockup-name">{BRAND.name}</span>
        <span className="lockup-tag">{BRAND.tagline}</span>
      </div>
    </div>
  );
}
