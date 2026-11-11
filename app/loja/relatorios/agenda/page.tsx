import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho } from '@/components/ui';
import { Icone } from '@/components/icone';
import { Kpi } from '@/components/kpi';
import { Placa } from '@/components/os/placa';
import { GraficoBarras } from '@/components/relatorios/grafico';
import { dataHora } from '@/lib/formato';
import { descreverFiltrosAgenda, montarRelatorioAgenda, normalizarFiltrosAgenda, opcoesAgenda, queryAgenda, type FiltrosAgenda } from '@/lib/agenda-relatorio';
import { AGRUPAR_AGENDA, SITUACOES_AGENDA, type AgruparAgenda, type SituacaoAgenda } from '@/lib/regras/agenda-relatorio';
import { formatarPct } from '@/lib/regras/relatorios';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Relatório da agenda' };

const TOM: Record<SituacaoAgenda, string> = {
  Realizada: 'text-ok', Agendada: 'text-info', 'Não realizada': 'text-error font-semibold', Frustrada: 'text-warn', Cancelada: 'text-text-secondary',
};

function Selecao({ id, rotulo, nome, valor, opcoes, todos }: { id: string; rotulo: string; nome: string; valor?: string; opcoes: { v: string; t: string }[]; todos: string }) {
  return (
    <div>
      <label htmlFor={id} className="rotulo">{rotulo}</label>
      <select id={id} name={nome} defaultValue={valor ?? ''} className="campo">
        <option value="">{todos}</option>
        {opcoes.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </div>
  );
}

export default async function RelatorioAgenda({ searchParams }: { searchParams: Promise<FiltrosAgenda> }) {
  await exigirPerfil('loja');
  const sb = await createClient();
  const f = normalizarFiltrosAgenda(await searchParams);
  const [op, rel] = await Promise.all([opcoesAgenda(sb), montarRelatorioAgenda(sb, f)]);
  const t = rel.totais;
  const dim = AGRUPAR_AGENDA[f.agrupar];
  const detalhe = rel.linhas.slice(0, 200);
  const exportar = (formato: string) => `/api/relatorios/agenda?${queryAgenda(f, { formato })}`;

  return (
    <>
      <Cabecalho kicker="Gestão · Relatórios" titulo="Relatório da agenda"
        descricao="Quantas vistorias estão agendadas para cada vistoriador no período, quantas já foram feitas e quantas passaram do horário sem ser realizadas." />
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/loja/relatorios" className="btn btn-texto btn-sm">← Outros relatórios</Link>
          <div className="flex gap-3">
            <a href={exportar('xlsx')} className="btn btn-secundario" download><Icone nome="download" />Excel</a>
            <a href={exportar('pdf')} className="btn btn-primario" download><Icone nome="download" />PDF</a>
          </div>
        </div>

        <form method="get" className="card grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Filtros">
          <div><label htmlFor="ag-de" className="rotulo">De</label><input id="ag-de" name="de" type="date" defaultValue={f.de} className="campo" /></div>
          <div><label htmlFor="ag-ate" className="rotulo">Até</label><input id="ag-ate" name="ate" type="date" defaultValue={f.ate} className="campo" /></div>
          <Selecao id="ag-vist" rotulo="Vistoriador" nome="vistoriador" valor={f.vistoriador} todos="Todos" opcoes={op.vistoriadores.map((v) => ({ v: v.id, t: v.nome }))} />
          <Selecao id="ag-patio" rotulo="Pátio" nome="patio" valor={f.patio} todos="Todos" opcoes={op.patios.map((p) => ({ v: p.id, t: p.nome }))} />
          <Selecao id="ag-cliente" rotulo="Cliente" nome="cliente" valor={f.cliente} todos="Todos" opcoes={op.clientes.map((c) => ({ v: c.id, t: c.nome }))} />
          <Selecao id="ag-sit" rotulo="Situação" nome="situacao" valor={f.situacao} todos="Todas" opcoes={SITUACOES_AGENDA.map((s) => ({ v: s, t: s }))} />
          <div className="flex items-end gap-3 sm:col-span-2 xl:col-span-3 xl:justify-end">
            <Link href="?" className="btn btn-fantasma">Limpar filtros</Link>
            <button className="btn btn-primario">Aplicar filtros</button>
          </div>
        </form>
        <p className="text-sm text-text-secondary" aria-live="polite">{descreverFiltrosAgenda(f, op).join(' · ')}</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi rotulo="Agendadas no período" valor={t.total} tom="escuro" detalhe={`em ${rel.grupos.length} ${f.agrupar === 'vistoriador' ? (rel.grupos.length === 1 ? 'vistoriador' : 'vistoriadores') : f.agrupar === 'dia' ? (rel.grupos.length === 1 ? 'dia' : 'dias') : (rel.grupos.length === 1 ? 'pátio' : 'pátios')}`} />
          <Kpi rotulo="Realizadas" valor={t.realizadas} detalhe={`${formatarPct(t.pctRealizadas)} das que já passaram`} />
          <Kpi rotulo="A realizar" valor={t.agendadas} detalhe="data e hora ainda por vir" />
          <Kpi rotulo="Não realizadas" valor={t.naoRealizadas} tom={t.naoRealizadas ? 'alerta' : undefined} detalhe="passou o horário e a OS segue a vistoriar" />
          <Kpi rotulo="Frustradas / canceladas" valor={`${t.frustradas} / ${t.canceladas}`} />
        </div>

        <nav aria-label="Agrupar por" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text-secondary">Agrupar por</span>
          {(Object.keys(AGRUPAR_AGENDA) as AgruparAgenda[]).map((a) => (
            <Link key={a} href={`?${queryAgenda({ ...f, agrupar: a })}`} aria-current={a === f.agrupar ? 'true' : undefined}
              className={`inline-flex min-h-toque items-center rounded-full border-[1.5px] px-4 text-sm font-semibold ${a === f.agrupar ? 'border-impact bg-impact text-white' : 'border-border bg-white hover:bg-surface'}`}>
              {AGRUPAR_AGENDA[a]}
            </Link>
          ))}
        </nav>

        <section className="card p-6" aria-labelledby="ag-graf">
          <h2 id="ag-graf" className="h3 mb-4">Vistorias agendadas por {dim.toLowerCase()}</h2>
          <GraficoBarras vertical={f.agrupar === 'dia'} titulo={`Agendadas por ${dim.toLowerCase()}`} formato={(v) => String(v)}
            itens={rel.grupos.map((g) => ({ rotulo: f.agrupar === 'dia' ? g.rotulo.slice(0, 5) : g.rotulo, valor: g.total, detalhe: `${g.realizadas} realizadas · ${g.agendadas} a realizar · ${g.naoRealizadas} não realizadas` }))} />
        </section>

        <section aria-labelledby="ag-tab" className="space-y-3">
          <h2 id="ag-tab" className="h3">Resumo por {dim.toLowerCase()}</h2>
          {rel.grupos.length === 0 ? <div className="card p-10 text-center text-text-secondary">Nenhuma vistoria agendada com esses filtros.</div> : (
            <div className="overflow-x-auto">
              <table className="tabela tabela-cartoes">
                <thead><tr>
                  <th scope="col">{dim}</th><th scope="col" className="!text-right">Agendadas</th><th scope="col" className="!text-right">Realizadas</th>
                  <th scope="col" className="!text-right">A realizar</th><th scope="col" className="!text-right">Não realizadas</th>
                  <th scope="col" className="!text-right">Frustradas</th><th scope="col" className="!text-right">Canceladas</th><th scope="col" className="!text-right">% realizadas</th>
                </tr></thead>
                <tbody>
                  {[...rel.grupos, t].map((g) => (
                    <tr key={g.chave} className={g.chave === 'total' ? '!bg-surface font-semibold' : ''}>
                      <th scope="row" data-rotulo={dim} className="text-left font-semibold">{g.rotulo}</th>
                      <td data-rotulo="Agendadas" className="text-right font-semibold tabular-nums">{g.total}</td>
                      <td data-rotulo="Realizadas" className="text-right tabular-nums">{g.realizadas}</td>
                      <td data-rotulo="A realizar" className="text-right tabular-nums">{g.agendadas}</td>
                      <td data-rotulo="Não realizadas" className={`text-right tabular-nums ${g.naoRealizadas ? 'text-error' : ''}`}>{g.naoRealizadas}</td>
                      <td data-rotulo="Frustradas" className="text-right tabular-nums">{g.frustradas}</td>
                      <td data-rotulo="Canceladas" className="text-right tabular-nums">{g.canceladas}</td>
                      <td data-rotulo="% realizadas" className="text-right tabular-nums">{formatarPct(g.pctRealizadas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {detalhe.length > 0 && (
          <section aria-labelledby="ag-det" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="ag-det" className="h3">Agendamentos</h2>
              <p className="text-sm text-text-secondary">{rel.linhas.length > 200 ? `Mostrando 200 de ${rel.linhas.length}. O Excel traz todos.` : `${rel.linhas.length} agendamento${rel.linhas.length === 1 ? '' : 's'}`}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="tabela tabela-cartoes">
                <thead><tr><th scope="col">Dia e hora</th><th scope="col">Vistoriador</th><th scope="col">Placa</th><th scope="col">Cliente</th><th scope="col">Local</th><th scope="col">Situação</th></tr></thead>
                <tbody>
                  {detalhe.map((l) => (
                    <tr key={`${l.numero}-${l.data_hora}`}>
                      <td data-rotulo="Dia e hora" className="whitespace-nowrap">{dataHora(l.data_hora)}</td>
                      <td data-rotulo="Vistoriador">{l.vistoriador ?? '—'}</td>
                      <td data-rotulo="Placa"><Link href={`/loja/os/${l.numero}`} className="inline-flex flex-col items-end gap-1 md:items-start"><Placa placa={l.placa} tamanho="sm" /><span className="text-xs text-text-secondary">OS {l.numero}</span></Link></td>
                      <td data-rotulo="Cliente">{l.cliente ?? '—'}</td>
                      <td data-rotulo="Local" className="max-w-[220px]">{l.local ?? l.patio ?? '—'}</td>
                      <td data-rotulo="Situação" className={TOM[l.situacao]}>{l.situacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
