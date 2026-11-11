import Link from 'next/link';
import { Icone } from '@/components/icone';
import { Kpi } from '@/components/kpi';
import { Placa } from '@/components/os/placa';
import { data as fmtData, moeda, STATUS_LABEL } from '@/lib/formato';
import { descreverFiltros, filtrosParaQuery, montarRelatorio, normalizarFiltros, opcoesFiltro, PAGAMENTO_REL, STATUS_REL, type FiltrosRel } from '@/lib/relatorios';
import { formatarHoras, formatarPct, motivosDaOs, SITUACAO_SLA, situacaoSla, TIPOS_RELATORIO, valorMetrica, type TipoRelatorio } from '@/lib/regras/relatorios';
import type { createClient } from '@/lib/supabase/server';
import { GraficoBarras } from './grafico';

type Sb = Awaited<ReturnType<typeof createClient>>;

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

export async function TelaRelatorios({ sb, modo, params }: { sb: Sb; modo: 'loja' | 'cliente'; params: FiltrosRel }) {
  const f = normalizarFiltros(params, modo);
  const [op, rel] = await Promise.all([opcoesFiltro(sb, modo), montarRelatorio(sb, f)]);
  const def = TIPOS_RELATORIO[f.tipo];
  const ehValor = def.metrica === 'valor';
  const base = modo === 'loja' ? '/loja' : '/app';
  const tipos = (Object.keys(TIPOS_RELATORIO) as TipoRelatorio[]).filter((t) => !(modo === 'cliente' && 'soLoja' in TIPOS_RELATORIO[t]));
  const descr = descreverFiltros(f, op);
  const exportar = (formato: string) => `/api/relatorios?${filtrosParaQuery(f, { formato })}`;
  const k = rel.kpis;
  const detalhe = rel.linhas.slice(0, 100);

  return (
    <div className="space-y-6">
      <nav aria-label="Relatórios" >
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Relatórios</p>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {tipos.map((t) => (
            <li key={t} className="shrink-0">
              <Link href={`?${filtrosParaQuery({ ...f, tipo: t })}`} aria-current={t === f.tipo ? 'page' : undefined}
                className={`flex min-h-toque items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors duration-[120ms] ${t === f.tipo ? 'bg-impact text-white' : 'border border-border bg-white text-text hover:bg-surface'}`}>
                {TIPOS_RELATORIO[t].titulo}
              </Link>
            </li>
          ))}
          {modo === 'loja' && (
            <li className="shrink-0">
              <Link href="/loja/relatorios/agenda" className="flex min-h-toque items-center gap-1 whitespace-nowrap rounded-full border border-border bg-white px-4 text-sm font-semibold text-text transition-colors duration-[120ms] hover:bg-surface">
                <Icone nome="agenda" className="h-4 w-4" />Agenda dos vistoriadores
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="h2">{def.titulo}</h2>
            <p className="text-text-secondary">{def.descricao}</p>
          </div>
          <div className="flex gap-3">
            <a href={exportar('xlsx')} className="btn btn-secundario" download><Icone nome="download" />Excel</a>
            <a href={exportar('pdf')} className="btn btn-primario" download><Icone nome="download" />PDF</a>
          </div>
        </div>

        <form method="get" className="card grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Filtros">
          <input type="hidden" name="tipo" value={f.tipo} />
          <div><label htmlFor="rel-de" className="rotulo">De</label><input id="rel-de" name="de" type="date" defaultValue={f.de} className="campo" /></div>
          <div><label htmlFor="rel-ate" className="rotulo">Até</label><input id="rel-ate" name="ate" type="date" defaultValue={f.ate} className="campo" /></div>
          {modo === 'loja' && <Selecao id="rel-cliente" rotulo="Cliente" nome="cliente" valor={f.cliente} todos="Todos" opcoes={op.clientes.map((c) => ({ v: c.id, t: c.nome }))} />}
          <Selecao id="rel-cidade" rotulo="Cidade" nome="cidade" valor={f.cidade} todos="Todas" opcoes={op.cidades.map((c) => ({ v: c, t: c }))} />
          {op.unidades.length > 0 && <Selecao id="rel-unidade" rotulo="Unidade" nome="unidade" valor={f.unidade} todos="Todas" opcoes={op.unidades.map((u) => ({ v: u, t: u }))} />}
          <Selecao id="rel-patio" rotulo="Pátio" nome="patio" valor={f.patio} todos="Todos" opcoes={op.patios.map((p) => ({ v: p.id, t: p.nome }))} />
          {modo === 'loja' && <Selecao id="rel-vist" rotulo="Vistoriador" nome="vistoriador" valor={f.vistoriador} todos="Todos" opcoes={op.vistoriadores.map((v) => ({ v: v.id, t: v.nome }))} />}
          <Selecao id="rel-status" rotulo="Status" nome="status" valor={f.status} todos="Todos" opcoes={Object.entries(STATUS_REL).map(([v, t]) => ({ v, t }))} />
          <Selecao id="rel-pag" rotulo="Pagamento" nome="pagamento" valor={f.pagamento} todos="Todos" opcoes={Object.entries(PAGAMENTO_REL).map(([v, t]) => ({ v, t }))} />
          <Selecao id="rel-prazo" rotulo="Situação do prazo" nome="prazo" valor={f.prazo} todos="Todas" opcoes={SITUACAO_SLA.map((s) => ({ v: s, t: s }))} />
          <div className="flex items-end gap-3 sm:col-span-2 xl:col-span-4 xl:justify-end">
            <Link href={`?tipo=${f.tipo}`} className="btn btn-fantasma">Limpar filtros</Link>
            <button className="btn btn-primario">Aplicar filtros</button>
          </div>
        </form>
        <p className="text-sm text-text-secondary" aria-live="polite">{descr.join(' · ')}</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Kpi rotulo="Vistorias" valor={k.total} detalhe={`${k.vistoriadas} vistoriada${k.vistoriadas === 1 ? '' : 's'}`} tom="escuro" />
          <Kpi rotulo="% no prazo" valor={formatarPct(k.pctNoPrazo)} detalhe={k.atrasadas ? `${k.atrasadas} com atraso` : 'das vistoriadas'} tom={k.atrasadas ? 'alerta' : undefined} />
          <Kpi rotulo="Tempo médio" valor={formatarHoras(k.tempoMedioHoras)} detalhe="abertura até o laudo, sem pausas" />
          <Kpi rotulo="Frustração" valor={formatarPct(k.pctFrustradas)} detalhe={`${k.frustradas} OS`} />
          <Kpi rotulo="Cancelamento" valor={formatarPct(k.pctCanceladas)} detalhe={`${k.canceladas} OS`} />
        </div>

        <section className="card p-6" aria-labelledby="rel-graf">
          <h3 id="rel-graf" className="h3 mb-4">{ehValor ? 'Valor (R$)' : 'OS'} por {def.dimensao.toLowerCase()}</h3>
          <GraficoBarras vertical={f.tipo === 'periodo'} titulo={`${ehValor ? 'Valor' : 'OS'} por ${def.dimensao.toLowerCase()}`}
            formato={ehValor ? moeda : (v) => String(v)}
            itens={rel.grupos.map((g) => ({ rotulo: g.rotulo, valor: valorMetrica(f.tipo, g), detalhe: ehValor ? `${g.a.total} OS` : `${formatarPct(g.a.pctNoPrazo)} no prazo · ${moeda(g.a.valor)}` }))} />
        </section>

        <section aria-labelledby="rel-tab" className="space-y-3">
          <h3 id="rel-tab" className="h3">Resumo por {def.dimensao.toLowerCase()}</h3>
          {rel.grupos.length === 0 ? <div className="card p-10 text-center text-text-secondary">Nenhuma OS com esses filtros.</div> : (
            <div className="overflow-x-auto">
              <table className="tabela tabela-cartoes">
                <thead><tr>
                  <th scope="col">{def.dimensao}</th><th scope="col" className="!text-right">OS</th><th scope="col" className="!text-right">Vistoriadas</th>
                  <th scope="col" className="!text-right">No prazo</th><th scope="col" className="!text-right">Tempo médio</th>
                  <th scope="col" className="!text-right">Frustradas</th><th scope="col" className="!text-right">Canceladas</th>
                  <th scope="col" className="!text-right">Valor</th><th scope="col" className="!text-right">Pendente</th>
                </tr></thead>
                <tbody>
                  {rel.grupos.map((g) => (
                    <tr key={g.chave}>
                      <th scope="row" data-rotulo={def.dimensao} className="text-left font-semibold">{g.rotulo}</th>
                      <td data-rotulo="OS" className="text-right tabular-nums">{g.a.total}</td>
                      <td data-rotulo="Vistoriadas" className="text-right tabular-nums">{g.a.vistoriadas}</td>
                      <td data-rotulo="No prazo" className="text-right tabular-nums">{formatarPct(g.a.pctNoPrazo)}</td>
                      <td data-rotulo="Tempo médio" className="text-right tabular-nums">{formatarHoras(g.a.tempoMedioHoras)}</td>
                      <td data-rotulo="Frustradas" className="text-right tabular-nums">{g.a.frustradas}</td>
                      <td data-rotulo="Canceladas" className="text-right tabular-nums">{g.a.canceladas}</td>
                      <td data-rotulo="Valor" className="text-right font-semibold tabular-nums">{moeda(g.a.valor)}</td>
                      <td data-rotulo="Pendente" className={`text-right tabular-nums ${g.a.pendente > 0 ? 'text-error' : ''}`}>{moeda(g.a.pendente)}</td>
                    </tr>
                  ))}
                  <tr className="!bg-surface font-semibold">
                    <th scope="row" data-rotulo={def.dimensao} className="text-left">Total</th>
                    <td data-rotulo="OS" className="text-right tabular-nums">{rel.linhas.length}</td>
                    <td data-rotulo="Vistoriadas" className="text-right tabular-nums">{rel.linhas.filter((l) => l.status === 'vistoriado').length}</td>
                    <td data-rotulo="No prazo" className="text-right" colSpan={1}>{formatarPct(k.pctNoPrazo)}</td>
                    <td data-rotulo="Tempo médio" className="text-right">{formatarHoras(k.tempoMedioHoras)}</td>
                    <td data-rotulo="Frustradas" className="text-right tabular-nums">{rel.linhas.filter((l) => l.foi_frustrada).length}</td>
                    <td data-rotulo="Canceladas" className="text-right tabular-nums">{rel.linhas.filter((l) => l.status === 'cancelado').length}</td>
                    <td data-rotulo="Valor" className="text-right tabular-nums">{moeda(rel.linhas.filter((l) => l.status !== 'cancelado').reduce((s, l) => s + Math.round(Number(l.valor ?? 0) * 100), 0) / 100)}</td>
                    <td data-rotulo="Pendente" className="text-right tabular-nums">{moeda(rel.linhas.filter((l) => l.status === 'vistoriado' && l.pagamento_status === 'pendente').reduce((s, l) => s + Math.round(Number(l.valor ?? 0) * 100), 0) / 100)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        {detalhe.length > 0 && (
          <section aria-labelledby="rel-det" className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="rel-det" className="h3">Placas</h3>
              <p className="text-sm text-text-secondary">{rel.linhas.length > 100 ? `Mostrando 100 de ${rel.linhas.length}. O Excel traz todas.` : `${rel.linhas.length} OS`}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="tabela tabela-cartoes">
                <thead><tr><th scope="col">Placa</th>{modo === 'loja' && <th scope="col">Cliente</th>}<th scope="col">Abertura</th><th scope="col">Status</th><th scope="col">Prazo</th><th scope="col">Motivo</th><th scope="col" className="!text-right">Valor</th></tr></thead>
                <tbody>
                  {detalhe.map((l) => (
                    <tr key={l.numero}>
                      <td data-rotulo="Placa"><Link href={`${base}/os/${l.numero}`} className="inline-flex flex-col items-end gap-1 md:items-start"><Placa placa={l.placa} tamanho="sm" /><span className="text-xs text-text-secondary">OS {l.numero}</span></Link></td>
                      {modo === 'loja' && <td data-rotulo="Cliente">{l.cliente}</td>}
                      <td data-rotulo="Abertura" className="whitespace-nowrap">{fmtData(l.aberta_em)}</td>
                      <td data-rotulo="Status">{STATUS_LABEL[l.status]}</td>
                      <td data-rotulo="Prazo">{situacaoSla(l)}{l.horas_atraso ? <span className="block text-xs text-error">+{formatarHoras(Number(l.horas_atraso))}</span> : null}</td>
                      <td data-rotulo="Motivo" className={`max-w-[220px] text-sm ${!l.motivo_atraso && l.status === 'vistoriado' && l.no_prazo === false ? 'font-semibold text-error' : ''}`}>{motivosDaOs(l) || '—'}</td>
                      <td data-rotulo="Valor" className="whitespace-nowrap text-right tabular-nums">{moeda(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
