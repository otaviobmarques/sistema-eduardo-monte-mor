import type { Metadata } from 'next';
import { AbasAuditoria } from '@/components/acessos/abas';
import { TelaAcessos, type FiltrosAcesso } from '@/components/acessos/tela';
import { Cabecalho } from '@/components/ui';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Auditoria · Acessos' };

export default async function Page({ searchParams }: { searchParams: Promise<FiltrosAcesso> }) {
  return (
    <>
      <Cabecalho kicker="Sistema" titulo="Auditoria" descricao="Cada entrada no sistema e cada tentativa que falhou, com data, IP e navegador." />
      <AbasAuditoria />
      <TelaAcessos sb={await createClient()} f={await searchParams} />
    </>
  );
}
