'use client';
import { useEffect, useRef, useState } from 'react';
import { Icone } from './icone';

export function Modal({
  aberto, onFechar, titulo, descricao, children, largura = 'max-w-lg',
}: { aberto: boolean; onFechar: () => void; titulo: string; descricao?: string; children: React.ReactNode; largura?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog
      ref={ref}
      onClose={onFechar}
      onClick={(e) => { if (e.target === ref.current) onFechar(); }}
      className={`w-[calc(100%-32px)] ${largura} rounded-painel bg-white p-0 text-text shadow-2xl backdrop:bg-black/50`}
    >
      {aberto && (
        <div className="p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="h3">{titulo}</h2>
              {descricao && <p className="mt-1 text-sm text-text-secondary">{descricao}</p>}
            </div>
            <button type="button" onClick={onFechar} className="btn btn-fantasma btn-sm -mr-2 -mt-1 px-2" aria-label="Fechar">
              <Icone nome="x" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

type TipoAviso = 'ok' | 'atencao' | 'erro' | 'info';
const ICONE_AVISO: Record<TipoAviso, string> = { ok: '✓', atencao: '!', erro: '!', info: 'i' };
const COR_ICONE: Record<TipoAviso, string> = { ok: 'bg-ok', atencao: 'bg-warn', erro: 'bg-error', info: 'bg-info' };

export function Aviso({ tipo, titulo, children, role }: { tipo: TipoAviso; titulo: string; children?: React.ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={role ?? (tipo === 'erro' ? 'alert' : 'status')}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${COR_ICONE[tipo]}`} aria-hidden>
        {ICONE_AVISO[tipo]}
      </span>
      <div>
        <p className="font-display text-base font-extrabold">{titulo}</p>
        {children && <div className="mt-0.5">{children}</div>}
      </div>
    </div>
  );
}

export function BotaoCopiar({ texto, rotulo = 'Copiar' }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secundario btn-sm"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); } catch { /* sem permissão */ }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      <Icone nome={copiado ? 'check' : 'copiar'} className="h-4 w-4" />
      <span aria-live="polite">{copiado ? 'Copiado' : rotulo}</span>
    </button>
  );
}

export function Selo({ tom, children }: { tom: 'ok' | 'atencao' | 'erro' | 'info' | 'neutro'; children: React.ReactNode }) {
  const cls = {
    ok: 'bg-ok-bg text-ok', atencao: 'bg-warn-bg text-warn', erro: 'bg-error-bg text-error',
    info: 'bg-info-bg text-info', neutro: 'bg-surface text-text-secondary',
  }[tom];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{children}</span>;
}

export function Cabecalho({ kicker, titulo, descricao, acoes }: { kicker?: string; titulo: string; descricao?: string; acoes?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker && <p className="kicker text-action">{kicker}</p>}
        <h1 className="h1 mt-1">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-2xl text-text-secondary">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-3">{acoes}</div>}
    </div>
  );
}
