import type { Metadata } from 'next';
import { NovaOsForm } from '@/components/os/nova-os-form';
import { Cabecalho } from '@/components/ui';
import { carregarDadosNovaOs } from '@/lib/nova-os-dados';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Abrir OS para cliente' };

export default async function NovaOsLoja({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const supabase = await createClient();
  const dados = await carregarDadosNovaOs(supabase, 'loja');
  const fixa = dados.empresas.find((e) => e.id === cliente)?.id;
  return (
    <>
      <Cabecalho kicker="Fila de OS" titulo="Abrir OS para cliente" descricao="Registre o pedido recebido por telefone ou mensagem. O nome do solicitante fica gravado na OS." />
      {dados.empresas.length === 0
        ? <div className="card p-8 text-center text-text-secondary">Cadastre um cliente ativo antes de abrir uma OS.</div>
        : <NovaOsForm {...dados} empresaFixa={fixa} />}
    </>
  );
}
