import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/hero';
import { Busca, Chips, TabelaOs } from '@/components/os/tabela-os';
import { buscarOs, ordenarPorUrgencia } from '@/lib/fila';
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
  const todas = await buscarOs(supabase, { status: encerradas ? ['vistoriado', 'cancelado'] : ['a_vistoriar', 'frustrado'], q, limite: encerradas ? 200 : 1000 });
  const filtro = FILTROS[(sla in FILTROS ? sla : '') as keyof typeof FILTROS];
  const linhas = encerradas ? todas : ordenarPorUrgencia(todas.filter((o) => filtro.f(o.sla.cor)));
  const conta = (k: keyof typeof FILTROS) => todas.filter((o) => FILTROS[k].f(o.sla.cor)).length;

  return (
    <div className="space-y-6">
      <Hero kicker="Fila de OS" titulo="Ordens de serviço" descricao={encerradas ? 'Vistoriadas e canceladas mais recentes.' : `${todas.length} em andamento, das mais urgentes para as menos urgentes.`}>
        <Link href="/loja/os/nova" className="btn btn-claro">Abrir OS para cliente</Link>
        <Link href="/loja/importar" className="btn btn-contorno-claro">Importar lote</Link>
      </Hero>
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
      <TabelaOs linhas={linhas} modo="loja" vazio={q ? 'Nenhuma OS encontrada com essa busca.' : 'Nenhuma OS nesta situação.'} />
    </div>
  );
}
