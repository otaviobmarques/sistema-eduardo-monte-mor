import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PainelCliente } from '@/components/painel-cliente';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Painel do cliente' };

/** A Loja vê o painel do cliente como ele vê (somente leitura). A RLS da Loja limita aos clientes dela. */
export default async function VisaoClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; status?: string; local?: string | string[] }> }) {
  await exigirPerfil('loja');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from('empresas_clientes').select('id, razao_social, nome_fantasia, logo_path, logo_atualizado_em').eq('id', id).maybeSingle();
  if (!e) notFound();
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 rounded-card border-l-4 border-info bg-info-bg px-4 py-3 text-info sm:flex-row sm:items-center sm:justify-between" role="status" data-teste="aviso-visao-cliente">
        <p><strong>Visão do cliente:</strong> é assim que {e.nome_fantasia || e.razao_social} vê o painel. Somente leitura; os botões de ação do cliente ficam escondidos.</p>
        <Link href={`/loja/clientes/${id}`} className="btn btn-secundario btn-sm shrink-0">Voltar ao cadastro</Link>
      </div>
      <PainelCliente supabase={supabase} empresa={e} params={await searchParams} previa />
    </>
  );
}
