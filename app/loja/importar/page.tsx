import type { Metadata } from 'next';
import { TelaImportar } from '@/components/importar/tela';

export const metadata: Metadata = { title: 'Importar lote' };

export default async function Page({ searchParams }: { searchParams: Promise<{ lote?: string; cliente?: string }> }) {
  const { lote, cliente } = await searchParams;
  return <TelaImportar modo="loja" loteId={lote} empresaFixa={cliente} />;
}
