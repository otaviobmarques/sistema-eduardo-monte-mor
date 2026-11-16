import type { Metadata } from 'next';
import { PainelCliente } from '@/components/painel-cliente';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Painel' };

export default async function PainelClientePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; local?: string | string[] }> }) {
  const s = await exigirPerfil('cliente');
  const supabase = await createClient();
  return <PainelCliente supabase={supabase} empresa={s.empresa} params={await searchParams} />;
}
