import type { Metadata } from 'next';
import { GradeKpi, Kpi } from '@/components/kpi';
import { Chips } from '@/components/os/tabela-os';
import { Aviso, Cabecalho } from '@/components/ui';
import { ambienteAsaas, asaasConfigurado } from '@/lib/asaas';
import { formaValida } from '@/lib/asaas-formas';
import { moeda } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';
import { NovaFatura, TabelaFaturas, type FaturaVista } from '../componentes';

export const metadata: Metadata = { title: 'Cobrança' };

export default async function CobrancaPage({ searchParams }: { searchParams: Promise<{ status?: string; ambiente?: string }> }) {
  const { status = '', ambiente: filtroAmb = '' } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from('faturas').select('id, tipo, descricao, valor, vencimento, status, link_pagamento, pago_em, asaas_payment_id, ambiente, lojas(nome)').order('vencimento', { ascending: false }).limit(500);
  const todas = (data ?? []).map((f) => ({ ...f, loja: (f.lojas as unknown as { nome: string } | null)?.nome })) as FaturaVista[];
  const reais = todas.filter((f) => f.ambiente !== 'sandbox');
  const testes = todas.filter((f) => f.ambiente === 'sandbox');
  const doAmbiente = filtroAmb === 'teste' ? testes : filtroAmb === 'todas' ? todas : reais;
  const lista = status ? doAmbiente.filter((f) => f.status === status) : doAmbiente;
  const [{ data: lojas }, ativo, ambiente, { data: gp }] = await Promise.all([
    supabase.from('lojas').select('id, nome, cnpj').eq('ativo', true).order('nome'), asaasConfigurado(), ambienteAsaas(),
    supabase.from('gateways_pagamento').select('forma_pagamento').eq('provedor', 'asaas').maybeSingle(),
  ]);
  const forma = formaValida(gp?.forma_pagamento);
  // Os totais contam só o que é real (produção e manuais): faturas de teste não são dinheiro
  const soma = (s: string[]) => reais.filter((f) => s.includes(f.status)).reduce((a, f) => a + Number(f.valor), 0);
  return (
    <>
      <Cabecalho kicker="Plataforma" titulo="Cobrança das Lojas" descricao="Start do projeto e mensalidades. Pelo Asaas a baixa é automática; nas faturas manuais, dê baixa ao receber."
        acoes={<NovaFatura lojas={(lojas ?? []).map((l) => ({ id: l.id, nome: l.nome, temCnpj: !!l.cnpj }))} gatewayAtivo={ativo} ambiente={ambiente} formaPadrao={forma} />} />
      {!ativo && <div className="mb-6"><Aviso tipo="atencao" titulo="Nenhum gateway de pagamento ativo">Configure o Asaas em <a className="font-semibold underline" href="/admin/gateways">Gateways de pagamento</a> para gerar Pix, boleto e cartão com baixa automática.</Aviso></div>}
      {ativo && ambiente === 'sandbox' && <div className="mb-6"><Aviso tipo="info" titulo="Ambiente em uso: Teste (sandbox)">As cobranças novas não são reais: ficam marcadas como Teste, não bloqueiam Lojas e o Gestor não as vê. Troque para Produção no seletor de <a className="font-semibold underline" href="/admin/gateways">Gateways de pagamento</a> quando for cobrar de verdade.</Aviso></div>}
      <div className="mb-6"><GradeKpi>
        <Kpi rotulo="Em aberto" valor={moeda(soma(['pendente']))} />
        <Kpi rotulo="Vencido" valor={moeda(soma(['vencido']))} tom={soma(['vencido']) > 0 ? 'alerta' : undefined} />
        <Kpi rotulo="Recebido" valor={moeda(soma(['pago']))} tom="escuro" />
        <Kpi rotulo="Faturas reais" valor={reais.length} detalhe={testes.length ? `+ ${testes.length} de teste` : undefined} />
      </GradeKpi></div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Chips param="status" atual={status} extra={{ ambiente: filtroAmb || undefined }} opcoes={[{ valor: '', rotulo: 'Todas', qtd: doAmbiente.length }, { valor: 'pendente', rotulo: 'Em aberto' }, { valor: 'vencido', rotulo: 'Vencidas' }, { valor: 'pago', rotulo: 'Pagas' }]} />
        <Chips param="ambiente" atual={filtroAmb} extra={{ status: status || undefined }} opcoes={[{ valor: '', rotulo: 'Reais', qtd: reais.length }, { valor: 'teste', rotulo: 'Teste', qtd: testes.length }, { valor: 'todas', rotulo: 'Todos os ambientes', qtd: todas.length }]} />
      </div>
      <TabelaFaturas faturas={lista} admin mostrarLoja />
    </>
  );
}
