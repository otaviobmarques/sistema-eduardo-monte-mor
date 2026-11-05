import type { Metadata } from 'next';
import { FechamentoTela, type FiltrosFin } from '@/components/financeiro/telas';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Financeiro · Fechamento mensal' };

export default async function Page({ searchParams }: { searchParams: Promise<FiltrosFin> }) {
  return <FechamentoTela sb={await createClient()} modo="loja" f={await searchParams} />;
}
