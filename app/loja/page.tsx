import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/hero';
import { Busca, Chips, TabelaOs } from '@/components/os/tabela-os';
import { Kpi } from '@/components/kpi';
import { Icone } from '@/components/icone';
import { buscarOs, ordenarPorUrgencia } from '@/lib/fila';
import { hora, moeda } from '@/lib/formato';
import { numerosDoMes, vistoriadoresHoje } from '@/lib/paineis';
import { nomeDoMes } from '@/lib/regras/financeiro';
import { formatarPct } from '@/lib/regras/relatorios';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Fila de OS' };

const FILTROS = {
  '': { rotulo: 'Todas', f: () => true },
  vencidas: { rotulo: 'Vencidas', f: (c: string) => c === 'vermelho' },
  vencendo: { rotulo: 'Vencendo', f: (c: string) => c === 'amarelo' },
  prazo: { rotulo: 'No prazo', f: (c: string) => c === 'verde' },
  pausadas: { rotulo: 'Pausadas', f: (c: string) => c === 'cinza' },
} as const;

export default async function FilaPage({ searchParams }: { searchParams: Promise<{ q?: string; sla?: string; ver?: string }> }) {
  const { q = '', sla = '', ver = '' } = await searchParams;
  const supabase = await createClient();
  const encerradas = ver === 'encerradas';
  const { linhas: todas, cfg } = await buscarOs(supabase, { status: encerradas ? ['vistoriado', 'cancelado'] : ['a_vistoriar', 'frustrado'], q, limite: encerradas ? 200 : 1000 });
  const filtro = FILTROS[(sla in FILTROS ? sla : '') as keyof typeof FILTROS];
  const linhas = encerradas ? todas : ordenarPorUrgencia(todas.filter((o) => filtro.f(o.sla.cor)));
  const conta = (k: keyof typeof FILTROS) => todas.filter((o) => FILTROS[k].f(o.sla.cor)).length;
  const [n, agenda, { linhas: abertas }] = await Promise.all([
    numerosDoMes(supabase), vistoriadoresHoje(supabase),
    encerradas ? buscarOs(supabase, { status: ['a_vistoriar', 'frustrado'], limite: 1000 }) : Promise.resolve({ linhas: todas }),
  ]);
  const cor = (c: string) => abertas.filter((o) => o.sla.cor === c).length;
  const mesNome = nomeDoMes(n.mes).split(' ')[0];
  const exportar = (formato: string) => `/api/fila?${new URLSearchParams({ formato, ...(q ? { q } : {}), ...(sla ? { sla } : {}) })}`;

  return (
    <div className="space-y-6">
      <Hero kicker="Fila de OS" titulo="Ordens de serviço" descricao={encerradas ? 'Vistoriadas e canceladas mais recentes.' : `${todas.length} em andamento, das mais urgentes para as menos urgentes.`}>
        <Link href="/loja/os/nova" className="btn btn-claro">Abrir OS para cliente</Link>
        <Link href="/loja/importar" className="btn btn-contorno-claro">Importar lote</Link>
      </Hero>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Indicadores">
        <Kpi rotulo="A vistoriar" valor={abertas.filter((o) => o.status === 'a_vistoriar').length} detalhe={`${abertas.filter((o) => o.status === 'frustrado').length} frustradas aguardando`} tom="escuro" />
        <Kpi rotulo="Vencendo" valor={cor('amarelo')} detalhe="passaram de 24h" />
        <Kpi rotulo="Vencidas" valor={cor('vermelho')} detalhe={cor('vermelho') ? 'precisam de justificativa' : 'nenhuma atrasada'} tom={cor('vermelho') ? 'alerta' : undefined} />
        <Kpi rotulo={`Vistoriadas em ${mesNome}`} valor={n.vistoriadas} detalhe={`${formatarPct(n.pctNoPrazo)} no prazo`} />
        <Kpi rotulo={`Frustradas / canceladas`} valor={`${n.frustradasNoMes} / ${n.canceladasNoMes}`} detalhe={`em ${mesNome}`} />
        <Kpi rotulo="A receber" valor={moeda(n.aReceber)} detalhe={`${n.qtdAReceber} placa${n.qtdAReceber === 1 ? '' : 's'} vistoriada${n.qtdAReceber === 1 ? '' : 's'}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5" aria-labelledby="card-atraso">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 id="card-atraso" className="h3">Motivos de atraso em {mesNome}</h2><Link href="/loja/relatorios?tipo=sla" className="btn btn-texto btn-sm">Ver relatório</Link></div>
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
        <Busca valor={q} placeholder="Placa, Renavam, modelo, solicitante ou nº da OS" extra={{ sla: sla || undefined, ver: ver || undefined }} />
        <nav className="abas" aria-label="Situação">
          <Link href={`?${new URLSearchParams(q ? { q } : {})}`} className="aba" aria-current={!encerradas ? 'page' : undefined}>Em andamento</Link>
          <Link href={`?${new URLSearchParams({ ...(q ? { q } : {}), ver: 'encerradas' })}`} className="aba" aria-current={encerradas ? 'page' : undefined}>Encerradas</Link>
        </nav>
      </div>
      {!encerradas && (
        <Chips param="sla" atual={sla in FILTROS ? sla : ''} extra={{ q: q || undefined }}
          opcoes={(Object.keys(FILTROS) as (keyof typeof FILTROS)[]).map((k) => ({ valor: k, rotulo: FILTROS[k].rotulo, qtd: conta(k) }))} />
      )}
      <div className="flex justify-end gap-3">
        <a href={exportar('xlsx')} className="btn btn-secundario btn-sm" download><Icone nome="download" className="h-4 w-4" />Exportar Excel</a>
        <a href={exportar('pdf')} className="btn btn-secundario btn-sm" download><Icone nome="download" className="h-4 w-4" />Exportar PDF</a>
      </div>
      <TabelaOs cfg={cfg} linhas={linhas} modo="loja" vazio={q ? 'Nenhuma OS encontrada com essa busca.' : 'Nenhuma OS nesta situação.'} />
    </div>
  );
}
