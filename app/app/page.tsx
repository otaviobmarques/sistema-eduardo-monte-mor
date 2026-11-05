import type { Metadata } from 'next';
import Link from 'next/link';
import { Hero } from '@/components/hero';
import { Busca, Chips, TabelaOs } from '@/components/os/tabela-os';
import { Kpi } from '@/components/kpi';
import { buscarOs, ordenarPorUrgencia } from '@/lib/fila';
import { moeda } from '@/lib/formato';
import { numerosDoMes } from '@/lib/paineis';
import { nomeDoMes } from '@/lib/regras/financeiro';
import { formatarPct } from '@/lib/regras/relatorios';
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
  const [{ count: aguardando }, n] = await Promise.all([
    supabase.from('pendencias').select('id', { count: 'exact', head: true }).is('resolvida_em', null).eq('responsavel', 'cliente'),
    numerosDoMes(supabase),
  ]);
  const mesNome = nomeDoMes(n.mes).split(' ')[0];
  const qtd = (st: string) => todas.filter((o) => o.status === st).length;
  return (
    <div className="space-y-6">
      <Hero kicker="Painel" titulo={`Olá, ${nome}`} descricao="Acompanhe prazo, status e laudo de cada placa.">
        <Link href="/app/nova-os" className="btn btn-claro">Nova OS</Link>
        <Link href="/app/importar" className="btn btn-contorno-claro">Importar planilha</Link>
      </Hero>
      {!!aguardando && (
        <div className="aviso aviso-atencao flex-col sm:flex-row sm:items-center sm:justify-between" role="status">
          <div>
            <p className="font-display text-base font-extrabold">{aguardando === 1 ? '1 pendência aguarda você' : `${aguardando} pendências aguardam você`}</p>
            <p>O prazo dessas OS está pausado até a resposta.</p>
          </div>
          <Link href="/app/pendencias" className="btn btn-primario">Responder pendências</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Indicadores">
        <Kpi rotulo={`Recebidas em ${mesNome}`} valor={n.recebidas} tom="escuro" />
        <Kpi rotulo={`Vistoriadas em ${mesNome}`} valor={n.vistoriadas} detalhe={`${formatarPct(n.pctNoPrazo)} no prazo`} />
        <Kpi rotulo="A vistoriar" valor={qtd('a_vistoriar')} detalhe="em andamento" />
        <Kpi rotulo="Frustradas" valor={qtd('frustrado')} detalhe="aguardando resolução" tom={qtd('frustrado') ? 'alerta' : undefined} />
        <Kpi rotulo={`Canceladas em ${mesNome}`} valor={n.canceladasNoMes} />
        <Kpi rotulo="Não pagas" valor={n.qtdAReceber} detalhe={moeda(n.aReceber)} />
      </div>
      <Busca valor={q} placeholder="Buscar por placa" extra={{ status: st || undefined }} />
      <Chips param="status" atual={st} extra={{ q: q || undefined }}
        opcoes={(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => ({ valor: k, rotulo: STATUS[k], qtd: k ? todas.filter((o) => o.status === k).length : todas.length }))} />
      <TabelaOs cfg={cfg} linhas={linhas} modo="cliente"
        vazio={q || st ? 'Nenhuma OS encontrada.' : <>Nenhuma OS ainda. <Link className="font-semibold text-action underline" href="/app/nova-os">Abra a primeira</Link>.</>} />
    </div>
  );
}
