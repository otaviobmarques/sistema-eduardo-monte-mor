'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Placa } from '@/components/os/placa';
import { Selo } from '@/components/ui';
import { data as fmtData, moeda, PAGAMENTO_LABEL } from '@/lib/formato';
import { rotuloForma, type StatusPagamento } from '@/lib/regras/financeiro';
import { ModalBaixa, type OsBaixa } from './baixa';

export interface LinhaTabela {
  id: string; numero: number; placa: string; marca_modelo: string | null; status: string; concluida_em: string | null;
  valor: number; valor_congelado: boolean; pagamento_status: StatusPagamento; pagamento_forma: string | null; pagamento_data: string | null;
  pagamento_obs: string | null; cliente: string;
}

const TOM = { pendente: 'atencao', pago: 'ok', faturado: 'info' } as const;
const FORMA = { pendente: '◆', pago: '●', faturado: '■' } as const;

export function SeloPagamento({ s }: { s: StatusPagamento }) {
  return <Selo tom={TOM[s]}><span aria-hidden>{FORMA[s]}</span>{PAGAMENTO_LABEL[s]}</Selo>;
}

/** Pagamentos por placa. Na Loja: seleção múltipla e baixa em lote. */
export function TabelaPagamentos({ linhas, modo }: { linhas: LinhaTabela[]; modo: 'loja' | 'cliente' }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [baixa, setBaixa] = useState<{ os: OsBaixa[]; inicial?: Parameters<typeof ModalBaixa>[0]['inicial'] } | null>(null);
  const base = modo === 'loja' ? '/loja' : '/app';
  const selecionadas = useMemo(() => linhas.filter((l) => sel.has(l.id)), [linhas, sel]);
  const totalSel = selecionadas.reduce((s, l) => s + Math.round(l.valor * 100), 0) / 100;
  const todas = linhas.length > 0 && selecionadas.length === linhas.length;
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const paraBaixa = (l: LinhaTabela): OsBaixa => ({ id: l.id, numero: l.numero, placa: l.placa, valor: l.valor });

  if (!linhas.length) return <div className="card p-10 text-center text-text-secondary">Nenhuma OS com esses filtros.</div>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="tabela tabela-cartoes">
          <thead><tr>
            {modo === 'loja' && <th scope="col" className="w-10"><input type="checkbox" className="h-5 w-5 accent-action" aria-label="Selecionar todas" checked={todas} onChange={() => setSel(todas ? new Set() : new Set(linhas.map((l) => l.id)))} /></th>}
            <th scope="col">Placa</th>{modo === 'loja' && <th scope="col">Cliente</th>}<th scope="col">Concluída</th>
            <th scope="col" className="!text-right">Valor</th><th scope="col">Pagamento</th>{modo === 'loja' && <th scope="col"><span className="sr-only">Ações</span></th>}
          </tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className={sel.has(l.id) ? '!bg-info-bg' : ''}>
                {modo === 'loja' && <td data-rotulo="Selecionar"><input type="checkbox" className="h-5 w-5 accent-action" aria-label={`Selecionar ${l.placa}`} checked={sel.has(l.id)} onChange={() => alternar(l.id)} /></td>}
                <td data-rotulo="Placa">
                  <Link href={`${base}/os/${l.numero}`} className="inline-flex flex-col items-end gap-1 md:items-start"><Placa placa={l.placa} tamanho="sm" /><span className="text-xs text-text-secondary">OS {l.numero}{l.marca_modelo ? ` · ${l.marca_modelo}` : ''}</span></Link>
                </td>
                {modo === 'loja' && <td data-rotulo="Cliente">{l.cliente}</td>}
                <td data-rotulo="Concluída" className="whitespace-nowrap">{l.concluida_em ? fmtData(l.concluida_em) : <span className="text-text-secondary">Em andamento</span>}</td>
                <td data-rotulo="Valor" className="whitespace-nowrap text-right font-semibold tabular-nums"><div>{moeda(l.valor)}{!l.valor_congelado && <span className="block text-xs font-normal text-text-secondary">previsto</span>}</div></td>
                <td data-rotulo="Pagamento">
                  <div className="flex flex-col items-end gap-1 md:items-start">
                    <SeloPagamento s={l.pagamento_status} />
                    {l.pagamento_status !== 'pendente' && <span className="text-xs text-text-secondary">{rotuloForma(l.pagamento_forma)} · {fmtData(l.pagamento_data)}</span>}
                    {l.pagamento_obs && <span className="max-w-[220px] truncate text-xs text-text-secondary" title={l.pagamento_obs}>{l.pagamento_obs}</span>}
                  </div>
                </td>
                {modo === 'loja' && (
                  <td data-rotulo="" className="text-right">
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => setBaixa({ os: [paraBaixa(l)], inicial: { status: l.pagamento_status, forma: l.pagamento_forma, data: l.pagamento_data, obs: l.pagamento_obs } })}>
                      {l.pagamento_status === 'pendente' ? 'Dar baixa' : 'Alterar'}<span className="sr-only"> · {l.placa}</span>
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modo === 'loja' && selecionadas.length > 0 && (
        <div className="sticky bottom-20 z-20 mt-4 flex flex-col gap-3 rounded-painel bg-impact p-4 text-white shadow-2xl sm:flex-row sm:items-center sm:justify-between lg:bottom-4" role="region" aria-label="Seleção">
          <p><span className="font-display text-xl font-black">{selecionadas.length}</span> selecionada{selecionadas.length > 1 ? 's' : ''} · <span className="font-semibold">{moeda(totalSel)}</span></p>
          <div className="flex gap-3">
            <button type="button" className="btn btn-sm border border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => setSel(new Set())}>Limpar</button>
            <button type="button" className="btn btn-primario btn-sm" onClick={() => setBaixa({ os: selecionadas.map(paraBaixa) })}>Dar baixa nas selecionadas</button>
          </div>
        </div>
      )}
      {baixa && <ModalBaixa aberto onFechar={() => setBaixa(null)} os={baixa.os} inicial={baixa.inicial} onConcluir={() => setSel(new Set())} />}
    </>
  );
}
