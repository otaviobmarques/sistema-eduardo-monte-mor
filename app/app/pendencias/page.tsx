import type { Metadata } from 'next';
import { ListaPendencias } from '@/components/os/lista-pendencias';
import { Cabecalho } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Pendências' };

export default async function Page({ searchParams }: { searchParams: Promise<{ tipo?: string; ver?: string }> }) {
  const { tipo = '', ver = '' } = await searchParams;
  const supabase = await createClient();
  return (
    <>
      <Cabecalho kicker="Operação" titulo="Pendências" descricao="Pendências das suas OS. Responda as que aguardam você para a vistoria seguir." />
      <ListaPendencias supabase={supabase} modo="cliente" tipo={tipo} ver={ver} />
    </>
  );
}
