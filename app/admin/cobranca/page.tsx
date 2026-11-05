import type { Metadata } from 'next';
import { GradeKpi, Kpi } from '@/components/kpi';
import { Chips } from '@/components/os/tabela-os';
import { Aviso, Cabecalho } from '@/components/ui';
import { ambienteAsaas, asaasConfigurado } from '@/lib/asaas';
import { moeda } from '@/lib/formato';
import { createClient } from '@/lib/supabase/server';
import { TabelaFaturas, type FaturaVista } from '../componentes';

export const metadata: Metadata = { title: 'Cobrança' };

export default async function CobrancaPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = '' } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from('faturas').select('id, tipo, descricao, valor, vencimento, status, link_pagamento, pago_em, asaas_payment_id, lojas(nome)').order('vencimento', { ascending: false }).limit(500);
  const todas = (data ?? []).map((f) => ({ ...f, loja: (f.lojas as unknown as { nome: string } | null)?.nome })) as FaturaVista[];
  const lista = status ? todas.filter((f) => f.status === status) : todas;
  const soma = (s: string[]) => todas.filter((f) => s.includes(f.status)).reduce((a, f) => a + Number(f.valor), 0);
  return (
    <>
      <Cabecalho kicker="Plataforma" titulo="Cobrança das Lojas" descricao="Start do projeto e mensalidades. Pelo Asaas a baixa é automática; nas faturas manuais, dê baixa ao receber." />
      {!asaasConfigurado() && <div className="mb-6"><Aviso tipo="atencao" titulo="Asaas ainda não configurado">Informe a chave de API do Asaas para gerar Pix, boleto e cartão automaticamente.</Aviso></div>}
      {asaasConfigurado() && ambienteAsaas() === 'sandbox' && <div className="mb-6"><Aviso tipo="info" titulo="Asaas em modo de teste (sandbox)">As cobranças não são reais. Troque para produção quando for cobrar de verdade.</Aviso></div>}
      <div className="mb-6"><GradeKpi>
        <Kpi rotulo="Em aberto" valor={moeda(soma(['pendente']))} />
        <Kpi rotulo="Vencido" valor={moeda(soma(['vencido']))} tom={soma(['vencido']) > 0 ? 'alerta' : undefined} />
        <Kpi rotulo="Recebido" valor={moeda(soma(['pago']))} tom="escuro" />
        <Kpi rotulo="Faturas" valor={todas.length} />
      </GradeKpi></div>
      <div className="mb-4"><Chips param="status" atual={status} opcoes={[{ valor: '', rotulo: 'Todas', qtd: todas.length }, { valor: 'pendente', rotulo: 'Em aberto' }, { valor: 'vencido', rotulo: 'Vencidas' }, { valor: 'pago', rotulo: 'Pagas' }]} /></div>
      <TabelaFaturas faturas={lista} admin mostrarLoja />
    </>
  );
}
