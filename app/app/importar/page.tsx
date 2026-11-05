import type { Metadata } from 'next';
import { TelaImportar } from '@/components/importar/tela';
import { exigirPerfil } from '@/lib/sessao';

export const metadata: Metadata = { title: 'Importar planilha' };

export default async function Page({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const s = await exigirPerfil('cliente');
  const { lote } = await searchParams;
  return <TelaImportar modo="cliente" loteId={lote} nomeEmpresa={s.empresa?.nome_fantasia || s.empresa?.razao_social} />;
}
