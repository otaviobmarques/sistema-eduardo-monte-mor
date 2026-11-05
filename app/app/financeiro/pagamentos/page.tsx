import type { Metadata } from 'next';
import { PagamentosTela, type FiltrosFin } from '@/components/financeiro/telas';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Financeiro · Pagamentos' };

export default async function Page({ searchParams }: { searchParams: Promise<FiltrosFin> }) {
  return <PagamentosTela sb={await createClient()} modo="cliente" f={await searchParams} />;
}
