import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/hero';
import { Busca, Chips, TabelaOs } from '@/components/os/tabela-os';
import { buscarOs, ordenarPorUrgencia } from '@/lib/fila';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Painel' };

const STATUS = { '': 'Todas', a_vistoriar: 'A vistoriar', frustrado: 'Frustradas', vistoriado: 'Vistoriadas', cancelado: 'Canceladas' } as const;

export default async function PainelCliente({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const s = await exigirPerfil('cliente');
  const { q = '', status = '' } = await searchParams;
  const supabase = await createClient();
  const { linhas: todas, cfg } = await buscarOs(supabase, { q, comLaudo: true });
  const st = status in STATUS ? status : '';
  const filtradas = st ? todas.filter((o) => o.status === st) : todas;
  const linhas = st === '' || st === 'a_vistoriar' || st === 'frustrado'
    ? [...ordenarPorUrgencia(filtradas.filter((o) => o.status === 'a_vistoriar' || o.status === 'frustrado')), ...filtradas.filter((o) => o.status === 'vistoriado' || o.status === 'cancelado')]
    : filtradas;
  const nome = s.empresa?.nome_fantasia || s.empresa?.razao_social;
  return (
    <div className="space-y-6">
      <Hero kicker="Painel" titulo={`Olá, ${nome}`} descricao="Acompanhe prazo, status e laudo de cada placa.">
        <Link href="/app/nova-os" className="btn btn-claro">Nova OS</Link>
        <Link href="/app/importar" className="btn btn-contorno-claro">Importar planilha</Link>
      </Hero>
      <Busca valor={q} placeholder="Buscar por placa" extra={{ status: st || undefined }} />
      <Chips param="status" atual={st} extra={{ q: q || undefined }}
        opcoes={(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => ({ valor: k, rotulo: STATUS[k], qtd: k ? todas.filter((o) => o.status === k).length : todas.length }))} />
      <TabelaOs cfg={cfg} linhas={linhas} modo="cliente"
        vazio={q || st ? 'Nenhuma OS encontrada.' : <>Nenhuma OS ainda. <Link className="font-semibold text-action underline" href="/app/nova-os">Abra a primeira</Link>.</>} />
    </div>
  );
}
