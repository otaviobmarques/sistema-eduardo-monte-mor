import type { Metadata } from 'next';
import { TelaRelatorios } from '@/components/relatorios/tela';
import { Cabecalho } from '@/components/ui';
import type { FiltrosRel } from '@/lib/relatorios';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Relatórios' };

export default async function Page({ searchParams }: { searchParams: Promise<FiltrosRel> }) {
  return (
    <>
      <Cabecalho kicker="Gestão" titulo="Relatórios" descricao="Desempenho de prazo, volume e valores, com os filtros que você escolher. Exporte em Excel ou PDF." />
      <TelaRelatorios sb={await createClient()} modo="loja" params={await searchParams} />
    </>
  );
}
