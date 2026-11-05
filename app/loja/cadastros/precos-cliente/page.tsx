import type { Metadata } from 'next';
import Link from 'next/link';
import { PrecosMatriz } from '@/components/precos-matriz';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Preços por cliente' };

export default async function PrecosClientePage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  const supabase = await createClient();
  const { data: empresas } = await supabase.from('empresas_clientes').select('id, razao_social, nome_fantasia, usa_tabela_propria').eq('ativo', true).order('razao_social');
  const proprias = (empresas ?? []).filter((e) => e.usa_tabela_propria);
  const sel = proprias.find((e) => e.id === cliente) ?? proprias[0];

  let conteudo: React.ReactNode = (
    <div className="card p-8 text-center text-text-secondary">
      Nenhum cliente usa tabela própria. Marque “Tabela de preços própria” no <Link className="font-semibold text-action underline" href="/loja/clientes">cadastro do cliente</Link>.
    </div>
  );
  if (sel) {
    const [{ data: servicos }, { data: categorias }, { data: precos }, { data: padrao }] = await Promise.all([
      supabase.from('servicos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('categorias_veiculo').select('id, nome').order('ordem'),
      supabase.from('precos_cliente').select('servico_id, categoria_id, valor').eq('empresa_cliente_id', sel.id),
      supabase.from('precos').select('servico_id, categoria_id, valor'),
    ]);
    const mapa = (l: { servico_id: string; categoria_id: string; valor: number }[] | null) => Object.fromEntries((l ?? []).map((p) => [`${p.servico_id}:${p.categoria_id}`, Number(p.valor)]));
    conteudo = <PrecosMatriz key={sel.id} empresaId={sel.id} servicos={servicos ?? []} categorias={categorias ?? []} valores={mapa(precos)} padrao={mapa(padrao)} />;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="h3">Preços por cliente</h2>
        <p className="mt-1 text-sm text-text-secondary">Sobrepõem a tabela padrão para clientes com tabela própria.</p>
      </div>
      {proprias.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Cliente">
          {proprias.map((e) => (
            <Link key={e.id} href={`?cliente=${e.id}`} aria-current={e.id === sel?.id ? 'page' : undefined}
              className={`btn btn-sm ${e.id === sel?.id ? 'btn-primario' : 'btn-secundario'}`}>{e.nome_fantasia || e.razao_social}</Link>
          ))}
        </nav>
      )}
      {sel && <p className="font-semibold">{sel.nome_fantasia || sel.razao_social}</p>}
      {conteudo}
    </section>
  );
}
