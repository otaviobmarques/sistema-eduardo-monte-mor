'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface OpcaoLocal { valor: string; rotulo: string; tipo: 'patio' | 'unidade'; qtd: number }

/** Filtro por várias Unidades/Pátios ao mesmo tempo (parâmetro `local` repetido na URL). */
export function FiltroLocal({ opcoes, selecionados, extra = {} }: { opcoes: OpcaoLocal[]; selecionados: string[]; extra?: Record<string, string | undefined> }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(selecionados);
  const [busca, setBusca] = useState('');
  const visiveis = useMemo(() => {
    const t = busca.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    return opcoes.filter((o) => !t || o.rotulo.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().includes(t));
  }, [opcoes, busca]);
  // Selecionados que não aparecem mais nas OS continuam visíveis para poder desmarcar
  const todas = [...visiveis, ...selecionados.filter((s) => !opcoes.some((o) => o.valor === s)).map((s) => ({ valor: s, rotulo: s.slice(2), tipo: s[0] === 'p' ? 'patio' as const : 'unidade' as const, qtd: 0 }))];
  const aplicar = (lista: string[]) => {
    const qs = new URLSearchParams(Object.entries(extra).filter(([, v]) => v) as [string, string][]);
    lista.forEach((l) => qs.append('local', l));
    setAberto(false);
    router.push(`?${qs}`);
  };
  const alternar = (v: string) => setMarcados((m) => (m.includes(v) ? m.filter((x) => x !== v) : [...m, v]));
  const grupo = (tipo: 'patio' | 'unidade', titulo: string) => {
    const itens = todas.filter((o) => o.tipo === tipo);
    if (!itens.length) return null;
    return (
      <fieldset className="mt-2">
        <legend className="legenda px-1 uppercase tracking-wide">{titulo}</legend>
        {itens.map((o) => (
          <label key={o.valor} className="flex min-h-toque cursor-pointer items-center gap-3 rounded-campo px-2 text-sm hover:bg-surface">
            <input type="checkbox" className="check" checked={marcados.includes(o.valor)} onChange={() => alternar(o.valor)} />
            <span className="flex-1 break-words">{o.rotulo}</span>
            <span className="rounded-full bg-surface px-2 text-xs font-semibold tabular-nums">{o.qtd}</span>
          </label>
        ))}
      </fieldset>
    );
  };
  const resumo = selecionados.length === 0 ? 'Todas as unidades e pátios' : selecionados.length === 1 ? selecionados[0].slice(2) : `${selecionados.length} unidades/pátios`;

  return (
    <div className="relative">
      <button type="button" className={`btn btn-sm ${selecionados.length ? 'btn-primario' : 'btn-secundario'}`} aria-expanded={aberto} aria-controls="filtro-local"
        onClick={() => { setMarcados(selecionados); setAberto((a) => !a); }}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <span className="max-w-[16rem] truncate">Unidade / Pátio: {resumo}</span>
      </button>
      {aberto && (
        <div id="filtro-local" role="dialog" aria-label="Filtrar por unidade ou pátio"
          className="absolute left-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-card border border-divider bg-white p-3 shadow-xl">
          <label htmlFor="filtro-local-busca" className="sr-only">Procurar unidade ou pátio</label>
          <input id="filtro-local-busca" className="campo" placeholder="Procurar unidade ou pátio" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <div className="mt-1 max-h-72 overflow-y-auto">
            {todas.length === 0 ? <p className="p-3 text-sm text-text-secondary">Nenhuma unidade ou pátio nas OS listadas.</p> : (<>{grupo('unidade', 'Unidades')}{grupo('patio', 'Pátios')}</>)}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
            <div className="flex gap-2">
              <button type="button" className="btn btn-texto btn-sm" onClick={() => setMarcados(visiveis.map((o) => o.valor))}>Marcar todas</button>
              <button type="button" className="btn btn-texto btn-sm" onClick={() => setMarcados([])}>Limpar</button>
            </div>
            <button type="button" className="btn btn-primario btn-sm" onClick={() => aplicar(marcados)}>
              {marcados.length ? `Mostrar ${marcados.length === 1 ? '1 local' : `${marcados.length} locais`}` : 'Mostrar todas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
