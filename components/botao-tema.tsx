'use client';
import { useEffect, useState } from 'react';

/** Alterna entre modo claro e noturno; a escolha fica salva neste aparelho. */
export function BotaoTema({ className = '' }: { className?: string }) {
  const [escuro, setEscuro] = useState(false);
  useEffect(() => { setEscuro(document.documentElement.classList.contains('dark')); }, []);
  const alternar = () => {
    const novo = !escuro;
    document.documentElement.classList.toggle('dark', novo);
    try { localStorage.setItem('av-tema', novo ? 'escuro' : 'claro'); } catch { /* sem storage: vale só nesta página */ }
    setEscuro(novo);
  };
  return (
    <button type="button" onClick={alternar} className={`btn btn-fantasma btn-sm px-2 ${className}`} aria-pressed={escuro}
      aria-label={escuro ? 'Mudar para o modo claro' : 'Mudar para o modo noturno'} title={escuro ? 'Modo claro' : 'Modo noturno'}>
      {escuro ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}
