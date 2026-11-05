import type { Metadata } from 'next';
import { TelaAcessos, type FiltrosAcesso } from '@/components/acessos/tela';
import { Cabecalho } from '@/components/ui';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Acessos' };

export default async function Page({ searchParams }: { searchParams: Promise<FiltrosAcesso> }) {
  await exigirPerfil('admin');
  return (
    <>
      <Cabecalho kicker="Segurança" titulo="Acessos" descricao="Entradas e tentativas que falharam em todas as Lojas, com data, IP e navegador." />
      <TelaAcessos sb={await createClient()} f={await searchParams} admin />
    </>
  );
}
