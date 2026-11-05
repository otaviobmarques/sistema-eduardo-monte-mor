/* Marca provisória até os arquivos do pacote brand/ chegarem (substituir por /brand/logo-*.png). */
export function Logo({ variante = 'colorido', className = '' }: { variante?: 'branco' | 'colorido' | 'sobre-vermelho'; className?: string }) {
  const cor = variante === 'colorido' ? '#373435' : '#FFFFFF';
  const destaque = variante === 'sobre-vermelho' ? '#FFFFFF' : '#ED3237';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="Auto Visão">
      <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" aria-hidden>
        <circle cx="17" cy="17" r="11" fill="none" stroke={destaque} strokeWidth="5" />
        <path d="M25 25l9 9" stroke={variante === 'colorido' ? '#151415' : variante === 'branco' ? '#FFFFFF' : '#151415'} strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="font-display text-xl font-black leading-none tracking-tight" style={{ color: cor }}>
        AUTO <span style={{ color: destaque }}>VISÃO</span>
      </span>
    </span>
  );
}

export function FaixaQuadriculada({ className = '' }: { className?: string }) {
  return <div className={`faixa-quadriculada ${className}`} aria-hidden />;
}

/** Ilustração do carro com lupa (provisória, em SVG). */
export function CarroLupa({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 120" className={className} aria-hidden>
      <path d="M20 86h196c6 0 10-4 10-10v-8c0-6-4-10-10-11l-30-5-24-22c-4-4-9-6-15-6H88c-6 0-11 2-15 6L52 50l-28 6c-6 1-10 6-10 12v8c0 6 2 10 6 10z" fill="#fff" opacity=".95" />
      <path d="M84 34h30v20H64zM122 34h26l22 20h-48z" fill="#ED3237" opacity=".35" />
      <circle cx="66" cy="88" r="16" fill="#151415" /><circle cx="66" cy="88" r="7" fill="#fff" />
      <circle cx="180" cy="88" r="16" fill="#151415" /><circle cx="180" cy="88" r="7" fill="#fff" />
      <circle cx="196" cy="30" r="20" fill="none" stroke="#151415" strokeWidth="8" />
      <path d="M210 44l18 18" stroke="#151415" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

export function CurvasConcentricas() {
  return (
    <svg viewBox="0 0 400 300" className="pointer-events-none absolute -right-16 -top-10 h-[140%] opacity-20" aria-hidden>
      {[60, 100, 140, 180, 220, 260].map((r) => (
        <circle key={r} cx="320" cy="60" r={r} fill="none" stroke="#fff" strokeWidth="2" />
      ))}
    </svg>
  );
}
