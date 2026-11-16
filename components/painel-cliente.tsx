import Link from 'next/link';
import { Hero } from '@/components/hero';
import { Busca, Chips, TabelaOs } from '@/components/os/tabela-os';
import { Kpi } from '@/components/kpi';
import { FiltroLocal } from '@/components/os/filtro-local';
import { buscarOs, filtrarPorLocal, lerLocais, opcoesDeLocal, ordenarPorUrgencia } from '@/lib/fila';
import { moeda } from '@/lib/formato';
import { urlLogo } from '@/lib/logo';
import { numerosDoMes } from '@/lib/paineis';
import { nomeDoMes } from '@/lib/regras/financeiro';
import { formatarPct } from '@/lib/regras/relatorios';
import type { createClient } from '@/lib/supabase/server';

const STATUS = { '': 'Todas', a_vistoriar: 'A vistoriar', frustrado: 'Frustradas', vistoriado: 'Vistoriadas', cancelado: 'Canceladas' } as const;

export interface EmpresaPainel { id: string; razao_social: string; nome_fantasia: string | null; logo_path?: string | null; logo_atualizado_em?: string | null }

/**
 * Painel do cliente (/app). Também usado pela Loja em “Ver painel do cliente” (`previa`): mesmos números e lista,
 * limitados à empresa, sem as ações do cliente e com os links indo para a ficha da Loja.
 */
export async function PainelCliente({ supabase, empresa, params, previa = false }: {
  supabase: Awaited<ReturnType<typeof createClient>>; empresa: EmpresaPainel | null;
  params: { q?: string; status?: string; local?: string | string[] }; previa?: boolean;
}) {
  const { q = '', status = '', local } = params;
  const locais = lerLocais(local);
  const empresaId = previa ? empresa?.id : undefined;
  const { linhas: semLocal, cfg } = await buscarOs(supabase, { q, comLaudo: true, empresaId });
  const opcoesLocal = opcoesDeLocal(semLocal);
  const todas = filtrarPorLocal(semLocal, locais);
  const st = status in STATUS ? status : '';
  const filtradas = st ? todas.filter((o) => o.status === st) : todas;
  const linhas = st === '' || st === 'a_vistoriar' || st === 'frustrado'
    ? [...ordenarPorUrgencia(filtradas.filter((o) => o.status === 'a_vistoriar' || o.status === 'frustrado')), ...filtradas.filter((o) => o.status === 'vistoriado' || o.status === 'cancelado')]
    : filtradas;
  const nome = empresa?.nome_fantasia || empresa?.razao_social;
  let pend = supabase.from('pendencias').select('id, ordens_servico!inner(empresa_cliente_id)', { count: 'exact', head: true }).is('resolvida_em', null).eq('responsavel', 'cliente');
  if (empresaId) pend = pend.eq('ordens_servico.empresa_cliente_id', empresaId);
  const [{ count: aguardando }, n] = await Promise.all([pend, numerosDoMes(supabase, empresaId)]);
  const mesNome = nomeDoMes(n.mes).split(' ')[0];
  const qtd = (s: string) => todas.filter((o) => o.status === s).length;
  const logo = empresa ? urlLogo(empresa.id, empresa.logo_path, empresa.logo_atualizado_em) : null;
  return (
    <div className="space-y-6">
      <Hero kicker="Painel" titulo={`Olá, ${nome}`} marca={logo ? { src: logo, nome: nome ?? '' } : null} descricao="Acompanhe prazo, status e laudo de cada placa.">
        {!previa && <>
          <Link href="/app/nova-os" className="btn btn-claro">Nova OS</Link>
          <Link href="/app/importar" className="btn btn-contorno-claro">Importar planilha</Link>
        </>}
      </Hero>
      {!!aguardando && (
        <div className="aviso aviso-atencao flex-col sm:flex-row sm:items-center sm:justify-between" role="status">
          <div>
            <p className="font-display text-base font-extrabold">{aguardando === 1 ? '1 pendência aguarda você' : `${aguardando} pendências aguardam você`}</p>
            <p>O prazo dessas OS está pausado até a resposta.</p>
          </div>
          {!previa && <Link href="/app/pendencias" className="btn btn-primario">Responder pendências</Link>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="Indicadores">
        <Kpi rotulo={`Recebidas em ${mesNome}`} valor={n.recebidas} tom="escuro" />
        <Kpi rotulo={`Vistoriadas em ${mesNome}`} valor={n.vistoriadas} detalhe={`${formatarPct(n.pctNoPrazo)} no prazo`} />
        <Kpi rotulo="A vistoriar" valor={qtd('a_vistoriar')} detalhe="em andamento" />
        <Kpi rotulo="Frustradas" valor={qtd('frustrado')} detalhe="aguardando resolução" tom={qtd('frustrado') ? 'alerta' : undefined} />
        <Kpi rotulo={`Canceladas em ${mesNome}`} valor={n.canceladasNoMes} />
        <Kpi rotulo="Total a pagar" valor={moeda(n.aReceber)} detalhe={`${n.qtdAReceber} placa${n.qtdAReceber === 1 ? '' : 's'} em aberto`} />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Busca valor={q} placeholder="Buscar por placa" extra={{ status: st || undefined, local: locais }} />
        {opcoesLocal.length > 0 || locais.length ? <FiltroLocal opcoes={opcoesLocal} selecionados={locais} extra={{ q: q || undefined, status: st || undefined }} /> : null}
      </div>
      <Chips param="status" atual={st} extra={{ q: q || undefined, local: locais }}
        opcoes={(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((k) => ({ valor: k, rotulo: STATUS[k], qtd: k ? todas.filter((o) => o.status === k).length : todas.length }))} />
      <TabelaOs cfg={cfg} linhas={linhas} modo="cliente" baseLinks={previa ? '/loja' : undefined}
        vazio={q || st || locais.length ? 'Nenhuma OS encontrada.' : previa ? 'Este cliente ainda não tem OS.' : <>Nenhuma OS ainda. <Link className="font-semibold text-action underline" href="/app/nova-os">Abra a primeira</Link>.</>} />
    </div>
  );
}
