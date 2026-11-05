import type { Metadata } from 'next';
import { TabelaFaturas, type FaturaVista } from '@/app/admin/componentes';
import { Cabecalho } from '@/components/ui';
import { moeda } from '@/lib/formato';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Assinatura' };

export default async function AssinaturaPage() {
  const s = await exigirPerfil('loja');
  const supabase = await createClient();
  const [{ data: loja }, { data: faturas }] = await Promise.all([
    supabase.from('lojas').select('nome, plano_mensal, dia_vencimento, dias_tolerancia').eq('id', s.perfil.loja_id!).single(),
    supabase.from('faturas').select('id, tipo, descricao, valor, vencimento, status, link_pagamento, pago_em, asaas_payment_id').order('vencimento', { ascending: false }),
  ]);
  return (
    <>
      <Cabecalho kicker="Sistema" titulo="Assinatura" descricao={`Mensalidade de ${moeda(loja?.plano_mensal)} com vencimento todo dia ${loja?.dia_vencimento}. Faturas vencidas há mais de ${loja?.dias_tolerancia} dias suspendem o acesso da Loja e dos clientes.`} />
      <section className="card p-6"><TabelaFaturas faturas={(faturas ?? []) as FaturaVista[]} /></section>
    </>
  );
}
