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
      <Cabecalho kicker="Operação" titulo="Pendências" descricao="Abertas por frustração ou falta de documento. Enquanto abertas, o prazo da OS fica pausado." />
      <ListaPendencias supabase={supabase} modo="loja" tipo={tipo} ver={ver} />
    </>
  );
}
