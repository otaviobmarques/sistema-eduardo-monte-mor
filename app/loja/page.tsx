import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/hero';
import { Busca, Chips, qsDe, TabelaOs } from '@/components/os/tabela-os';
import { Kpi } from '@/components/kpi';
import { Icone } from '@/components/icone';
import { buscarOs, filtrarPorLocal, lerLocais, opcoesDeLocal, ordenarPorUrgencia } from '@/lib/fila';
import { FiltroLocal } from '@/components/os/filtro-local';
import { AgendarLote } from '@/components/os/agendar-lote';
import { hora, moeda } from '@/lib/formato';
import { numerosDoMes, producaoVistoriadores, vistoriadoresHoje } from '@/lib/paineis';
import { PERIODOS_PRODUCAO, type PeriodoProducao } from '@/lib/regras/producao';
import { nomeDoMes } from '@/lib/regras/financeiro';
import { formatarPct } from '@/lib/regras/relatorios';
import { createClient } from '@/lib/supabase/server';
import { getSessao } from '@/lib/sessao';

export const metadata: Metadata = { title: 'Fila de OS' };

const FILTROS = {
  '': { rotulo: 'Todas', f: () => true },
  vencidas: { rotulo: 'Vencidas', f: (c: string) => c === 'vermelho' },
  vencendo: { rotulo: 'Vencendo', f: (c: string) => c === 'amarelo' },
  prazo: { rotulo: 'No prazo', f: (c: string) => c === 'verde' },
  pausadas: { rotulo: 'Pausadas', f: (c: string) => c === 'cinza' },
} as const;

export default async function FilaPage({ searchParams }: { searchParams: Promise<{ q?: string; sla?: string; ver?: string; local?: string | string[] }> }) {
  const { q = '', sla = '', ver = '', local } = await searchParams;
  const locais = lerLocais(local);
  const supabase = await createClient();
  const encerradas = ver === 'encerradas';
  const { linhas: semLocal, cfg } = await buscarOs(supabase, { status: encerradas ? ['vistoriado', 'cancelado'] : ['a_vistoriar', 'frustrado'], q, limite: encerradas ? 200 : 1000, comAgenda: !encerradas });
  const opcoesLocal = opcoesDeLocal(semLocal);
  const todas = filtrarPorLocal(semLocal, locais);
  const filtro = FILTROS[(sla in FILTROS ? sla : '') as keyof typeof FILTROS];
  const linhas = encerradas ? todas : ordenarPorUrgencia(todas.filter((o) => filtro.f(o.sla.cor)));
  const conta = (k: keyof typeof FILTROS) => todas.filter((o) => FILTROS[k].f(o.sla.cor)).length;
  const [n, agenda, { linhas: abertas }, { data: vistoriadores }, { data: motivosReag }, producao, { data: motivosAtraso }, sessao] = await Promise.all([
    numerosDoMes(supabase), vistoriadoresHoje(supabase),
    encerradas ? buscarOs(supabase, { status: ['a_vistoriar', 'frustrado'], limite: 1000 }) : Promise.resolve({ linhas: todas }),
    supabase.from('vistoriadores').select('id, nome').eq('ativo', true).order('nome'),
    supabase.from('motivos').select('id, descricao').eq('tipo', 'reagendamento').eq('ativo', true).order('ordem'),
    producaoVistoriadores(supabase),
    supabase.from('motivos').select('id, descricao').eq('tipo', 'atraso').eq('ativo', true).order('ordem'),
    getSessao(),
  ]);
  const cor = (c: string) => abertas.filter((o) => o.sla.cor === c).length;
  // Pausadas (a partir da pausa) saem de “A vistoriar” e ganham o próprio card
  const pausadas = abertas.filter((o) => o.status === 'a_vistoriar' && o.sla.pausada);
  const aVistoriar = abertas.filter((o) => o.status === 'a_vistoriar' && !o.sla.pausada);
  const frustradas = abertas.filter((o) => o.status === 'frustrado').length;
  const qtdManual = pausadas.filter((o) => o.motivoPausa?.includes('Pausa manual')).length;
  const qtdPendencia = pausadas.filter((o) => o.motivoPausa?.includes('Pendência')).length;
  const mesNome = nomeDoMes(n.mes).split(' ')[0];
  const exportar = (formato: string) => `/api/fila?${qsDe({ formato, q: q || undefined, sla: sla || undefined, local: locais })}`;

  return (
    <div className="space-y-6">
      <Hero kicker="Fila de OS" titulo="Ordens de serviço" descricao={encerradas ? 'Vistoriadas e canceladas mais recentes.' : `${todas.length} em andamento, das mais urgentes para as menos urgentes.`}>
        <Link href="/loja/os/nova" className="btn btn-claro">Abrir OS para cliente</Link>
        <Link href="/loja/importar" className="btn btn-contorno-claro">Importar lote</Link>
      </Hero>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Indicadores">
        <Kpi rotulo="A vistoriar" valor={aVistoriar.length} detalhe="em andamento, sem as pausadas e frustradas" tom="escuro" />
        <Link href="?sla=pausadas" className="block rounded-card transition-colors duration-[120ms] [&>div:hover]:border-impact focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-impact" aria-label={`Pausadas (com as frustradas): ${pausadas.length + frustradas}. Ver na fila`}>
          {/* Pausadas: as pausadas + as frustradas (pedido de 14/11/2026) */}
          <Kpi rotulo="Pausadas" valor={pausadas.length + frustradas}
            detalhe={pausadas.length + frustradas ? [qtdManual && `${qtdManual} pausa${qtdManual === 1 ? '' : 's'} manual${qtdManual === 1 ? '' : 'is'}`, qtdPendencia && `${qtdPendencia} com pendência`, frustradas && `${frustradas} frustrada${frustradas === 1 ? '' : 's'}`].filter(Boolean).join(' · ') || 'prazo parado' : 'nenhuma pausada'} />
        </Link>
        {/* Frustradas: as frustradas em andamento + as pausadas (pedido de 14/11/2026) */}
        <Kpi rotulo="Frustradas" valor={frustradas + pausadas.length} detalhe={`${frustradas} frustrada${frustradas === 1 ? '' : 's'} + ${pausadas.length} pausada${pausadas.length === 1 ? '' : 's'}`} tom={frustradas + pausadas.length ? 'alerta' : undefined} />
        <Kpi rotulo="Canceladas" valor={n.canceladasNoMes} detalhe={`em ${mesNome}`} />
        <Kpi rotulo="Vencidas" valor={cor('vermelho')} detalhe={cor('vermelho') ? 'precisam de justificativa' : 'nenhuma atrasada'} tom={cor('vermelho') ? 'alerta' : undefined} />
        <Kpi rotulo="Vencendo" valor={cor('amarelo')} detalhe="passaram de 24h" />
        <Kpi rotulo={`Vistorias em ${mesNome}`} valor={n.vistoriadas} detalhe={`vistoriadas · ${formatarPct(n.pctNoPrazo)} no prazo`} />
        <Kpi rotulo="Valor a receber" valor={moeda(n.aReceberMes)} detalhe={`${n.qtdAReceberMes} placa${n.qtdAReceberMes === 1 ? '' : 's'} de ${mesNome} · exceto canceladas`} />
      </div>
      <section className="card p-5" aria-labelledby="card-producao">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="card-producao" className="h3">Vistorias feitas por vistoriador</h2>
          <Link href="/loja/relatorios/agenda" className="btn btn-texto btn-sm">Relatório da agenda</Link>
        </div>
        {producao.linhas.length === 0 ? <p className="text-sm text-text-secondary">Nenhuma vistoria concluída neste mês.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider text-left text-xs uppercase tracking-wide text-text-secondary">
                  <th scope="col" className="py-2 pr-3 font-semibold">Vistoriador</th>
                  {(Object.keys(PERIODOS_PRODUCAO) as PeriodoProducao[]).map((k) => (
                    <th key={k} scope="col" className="px-2 py-2 text-right font-semibold">{PERIODOS_PRODUCAO[k]}<span className="block text-[11px] font-normal normal-case tracking-normal">{producao.periodos.rotulos[k]}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...producao.linhas, producao.total].map((l) => (
                  <tr key={l.vistoriador} className={`border-b border-divider last:border-0 ${l.vistoriador === 'Total' ? 'font-semibold' : ''}`}>
                    <th scope="row" className={`py-2 pr-3 text-left ${l.vistoriador === 'Sem vistoriador' ? 'font-normal text-text-secondary' : 'font-semibold'}`}>{l.vistoriador}</th>
                    {(Object.keys(PERIODOS_PRODUCAO) as PeriodoProducao[]).map((k) => (
                      <td key={k} className="px-2 py-2 text-right font-display text-base font-black tabular-nums">{l[k]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {producao.linhas.some((l) => l.vistoriador === 'Sem vistoriador') && (
          <p className="mt-3 text-xs text-text-secondary">“Sem vistoriador”: OS concluídas sem vistoriador definido. Informe na conclusão ou na ficha da OS (Vistoriador › Alterar).</p>
        )}
      </section>
      <section className="card p-5" aria-labelledby="card-patios">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="card-patios" className="h3">Vistorias por pátio em {mesNome}</h2>
          <Link href="/loja/relatorios?tipo=patio" className="btn btn-texto btn-sm">Ver relatório</Link>
        </div>
        {n.rankingPatios.length === 0 ? <p className="text-sm text-text-secondary">Nenhuma OS aberta no mês.</p> : (
          <ol className="space-y-3 text-sm">
            {n.rankingPatios.map((p, i) => (
              <li key={p.patio} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3">
                <span className="font-display text-lg font-black tabular-nums text-text-secondary">{i + 1}º</span>
                <div className="min-w-0">
                  <div className="flex justify-between gap-2"><span className="truncate font-semibold">{p.patio}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
                    <div className="h-full rounded-full bg-brand-graphite" style={{ width: `${Math.max(4, Math.round((p.total / n.rankingPatios[0].total) * 100))}%` }} />
                  </div>
                </div>
                <span className="text-right tabular-nums"><span className="font-semibold">{p.total}</span> OS<span className="block text-xs text-text-secondary">{p.vistoriadas} vistoriada{p.vistoriadas === 1 ? '' : 's'}</span></span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5" aria-labelledby="card-atraso">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="card-atraso" className="h3">Motivos de atraso em {mesNome}</h2><Link href={`/loja/relatorios?tipo=sla&prazo=${encodeURIComponent('Concluída com atraso')}`} className="btn btn-texto btn-sm">Ver atrasadas</Link></div>
          {n.motivosAtraso.length === 0 && !n.semMotivo ? <p className="text-sm text-text-secondary">Nenhuma vistoria atrasada no mês.</p> : (
            <ul className="divide-y divide-divider text-sm">
              {n.motivosAtraso.map((m) => <li key={m.motivo} className="flex justify-between gap-3 py-2"><span>{m.motivo}</span><span className="font-semibold tabular-nums">{m.qtd}</span></li>)}
              {n.semMotivo > 0 && <li className="flex justify-between gap-3 py-2 text-text-secondary"><span>Sem justificativa registrada</span><span className="font-semibold tabular-nums">{n.semMotivo}</span></li>}
            </ul>
          )}
        </section>
        <section className="card p-5" aria-labelledby="card-vist">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="card-vist" className="h3">Vistoriadores hoje</h2><Link href="/loja/agenda" className="btn btn-texto btn-sm">Abrir agenda</Link></div>
          {agenda.length === 0 ? <p className="text-sm text-text-secondary">Nenhuma vistoria agendada para hoje.</p> : (
            <ul className="divide-y divide-divider text-sm">
              {agenda.map((v) => <li key={v.nome} className="flex justify-between gap-3 py-2"><span>{v.nome}</span><span className="text-text-secondary"><span className="font-semibold text-text tabular-nums">{v.qtd}</span> vistoria{v.qtd === 1 ? '' : 's'} · a partir das {hora(v.primeira)}</span></li>)}
            </ul>
          )}
        </section>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Busca valor={q} placeholder="Placa, Renavam, modelo, solicitante ou nº da OS" extra={{ sla: sla || undefined, ver: ver || undefined, local: locais }} />
        <nav className="abas" aria-label="Situação">
          <Link href={`?${qsDe({ q: q || undefined, local: locais })}`} className="aba" aria-current={!encerradas ? 'page' : undefined}>Em andamento</Link>
          <Link href={`?${qsDe({ q: q || undefined, ver: 'encerradas', local: locais })}`} className="aba" aria-current={encerradas ? 'page' : undefined}>Encerradas</Link>
        </nav>
      </div>
      <FiltroLocal opcoes={opcoesLocal} selecionados={locais} extra={{ q: q || undefined, sla: sla || undefined, ver: ver || undefined }} />
      {!encerradas && (
        <Chips param="sla" atual={sla in FILTROS ? sla : ''} extra={{ q: q || undefined, local: locais }}
          opcoes={(Object.keys(FILTROS) as (keyof typeof FILTROS)[]).map((k) => ({ valor: k, rotulo: FILTROS[k].rotulo, qtd: conta(k) }))} />
      )}
      <div className="flex justify-end gap-3">
        <a href={exportar('xlsx')} className="btn btn-secundario btn-sm" download><Icone nome="download" className="h-4 w-4" />Exportar Excel</a>
        <a href={exportar('pdf')} className="btn btn-secundario btn-sm" download><Icone nome="download" className="h-4 w-4" />Exportar PDF</a>
      </div>
      {!encerradas && <AgendarLote vistoriadores={vistoriadores ?? []} motivos={motivosReag ?? []} motivosAtraso={motivosAtraso ?? []} podePausar={!!sessao?.perfil.conclusao_livre} />}
      <TabelaOs cfg={cfg} linhas={linhas} modo="loja" selecionavel={!encerradas} vazio={q || locais.length ? 'Nenhuma OS encontrada com essa busca.' : 'Nenhuma OS nesta situação.'} />
    </div>
  );
}
