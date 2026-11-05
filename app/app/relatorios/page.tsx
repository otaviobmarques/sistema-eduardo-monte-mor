import type { Metadata } from 'next';
import { TelaRelatorios } from '@/components/relatorios/tela';
import { Cabecalho } from '@/components/ui';
import type { FiltrosRel } from '@/lib/relatorios';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Relatórios' };

export default async function Page({ searchParams }: { searchParams: Promise<FiltrosRel> }) {
  return (
    <>
      <Cabecalho kicker="Gestão" titulo="Relatórios" descricao="Suas vistorias por período, cidade, pátio e prazo. Exporte em Excel ou PDF." />
      <TelaRelatorios sb={await createClient()} modo="cliente" params={await searchParams} />
    </>
  );
}
