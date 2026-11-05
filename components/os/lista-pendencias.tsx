import Link from 'next/link';
import { Chips } from './tabela-os';
import { Placa } from './placa';
import { ResolverPendencia, ResponderPendencia } from './operacoes';
import { GradeKpi, Kpi } from '@/components/kpi';
import { data as fmtData } from '@/lib/formato';
import { TIPO_PENDENCIA_LABEL } from '@/lib/operacao';
import { formatarDuracao } from '@/lib/regras/sla';
import type { createClient } from '@/lib/supabase/server';

type Sb = Awaited<ReturnType<typeof createClient>>;

export async function ListaPendencias({ supabase, modo, tipo, ver }: { supabase: Sb; modo: 'loja' | 'cliente'; tipo: string; ver: string }) {
  const resolvidas = ver === 'resolvidas';
  let q = supabase.from('pendencias')
    .select('id, tipo, descricao, responsavel, previsao, created_at, resolvida_em, resolucao_texto, resposta_cliente, ordens_servico!inner(numero, placa, marca_modelo, status, empresas_clientes(nome_fantasia, razao_social))')
    .order('created_at', { ascending: resolvidas ? false : true }).limit(500);
  q = resolvidas ? q.not('resolvida_em', 'is', null) : q.is('resolvida_em', null);
  const { data } = await q;
  const todas = data ?? [];
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const vencida = (p: (typeof todas)[number]) => !p.resolvida_em && !!p.previsao && p.previsao < hoje;
  const lista = tipo && tipo in TIPO_PENDENCIA_LABEL ? todas.filter((p) => p.tipo === tipo) : todas;
  const base = modo === 'loja' ? '/loja' : '/app';
  const agora = Date.now();

  return (
    <div className="space-y-6">
      {!resolvidas && (
        <GradeKpi>
          <Kpi rotulo="Abertas" valor={todas.length} tom="escuro" />
          <Kpi rotulo="Previsão vencida" valor={todas.filter(vencida).length} tom={todas.some(vencida) ? 'alerta' : undefined} />
          <Kpi rotulo={modo === 'loja' ? 'Com o cliente' : 'Aguardam você'} valor={todas.filter((p) => p.responsavel === 'cliente').length} />
          <Kpi rotulo={modo === 'loja' ? 'Com a Loja' : 'Com a Auto Visão'} valor={todas.filter((p) => p.responsavel === 'loja').length} />
        </GradeKpi>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Chips param="tipo" atual={tipo in TIPO_PENDENCIA_LABEL ? tipo : ''} extra={{ ver: ver || undefined }}
          opcoes={[{ valor: '', rotulo: 'Todas', qtd: todas.length }, ...Object.entries(TIPO_PENDENCIA_LABEL).map(([k, v]) => ({ valor: k, rotulo: v, qtd: todas.filter((p) => p.tipo === k).length }))]} />
        <nav className="abas" aria-label="Situação">
          <Link className="aba" href="?" aria-current={!resolvidas ? 'page' : undefined}>Abertas</Link>
          <Link className="aba" href="?ver=resolvidas" aria-current={resolvidas ? 'page' : undefined}>Resolvidas</Link>
        </nav>
      </div>
      {lista.length === 0 ? <div className="card p-10 text-center text-text-secondary">{resolvidas ? 'Nenhuma pendência resolvida.' : 'Nenhuma pendência aberta. 🎉'}</div> : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-cartoes">
            <thead><tr>
              <th scope="col">Placa</th>{modo === 'loja' && <th scope="col">Cliente</th>}<th scope="col">Pendência</th>
              <th scope="col">Responsável</th><th scope="col">{resolvidas ? 'Resolvida' : 'Aberta há'}</th><th scope="col">Previsão</th><th scope="col"><span className="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>
              {lista.map((p) => {
                const os = p.ordens_servico as unknown as { numero: number; placa: string; marca_modelo: string | null; empresas_clientes: { nome_fantasia: string | null; razao_social: string } | null };
                const v = vencida(p);
                return (
                  <tr key={p.id} className={v ? 'shadow-[inset_4px_0_0_#B42318]' : ''}>
                    <td data-rotulo="Placa"><Link href={`${base}/os/${os.numero}`} className="inline-flex flex-col items-end gap-1 md:items-start"><Placa placa={os.placa} tamanho="sm" /><span className="text-xs text-text-secondary">OS {os.numero}</span></Link></td>
                    {modo === 'loja' && <td data-rotulo="Cliente">{os.empresas_clientes?.nome_fantasia || os.empresas_clientes?.razao_social}</td>}
                    <td data-rotulo="Pendência" className="max-w-md">
                      <span className="font-semibold">{TIPO_PENDENCIA_LABEL[p.tipo as keyof typeof TIPO_PENDENCIA_LABEL]}</span>
                      <span className="block text-sm">{p.descricao}</span>
                      {p.resposta_cliente && <span className="mt-1 block text-xs text-info">Resposta do cliente: {p.resposta_cliente}</span>}
                      {p.resolucao_texto && <span className="mt-1 block text-xs text-ok">Resolução: {p.resolucao_texto}</span>}
                    </td>
                    <td data-rotulo="Responsável">{p.responsavel === 'cliente' ? 'Cliente' : 'Auto Visão'}</td>
                    <td data-rotulo={resolvidas ? 'Resolvida' : 'Aberta há'} className="whitespace-nowrap">{resolvidas ? fmtData(p.resolvida_em) : formatarDuracao(agora - new Date(p.created_at).getTime())}</td>
                    <td data-rotulo="Previsão" className={`whitespace-nowrap ${v ? 'font-semibold text-error' : ''}`}>{p.previsao ? <>{v && <span aria-hidden>■ </span>}{fmtData(p.previsao)}{v && <span className="sr-only"> (vencida)</span>}</> : '—'}</td>
                    <td data-rotulo="" className="text-right">
                      {!resolvidas && modo === 'loja' && <ResolverPendencia id={p.id} numero={os.numero} compacto />}
                      {!resolvidas && modo === 'cliente' && p.responsavel === 'cliente' && <div className="min-w-[240px] text-left"><ResponderPendencia id={p.id} numero={os.numero} /></div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
