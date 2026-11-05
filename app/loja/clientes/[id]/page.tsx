import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrecosMatriz } from '@/components/precos-matriz';
import { Aviso, Cabecalho } from '@/components/ui';
import { sugerirLogin } from '@/lib/formato';
import { formatarCnpj } from '@/lib/regras/cnpj';
import { createClient } from '@/lib/supabase/server';
import { AcessoCliente } from '../acesso';
import { ClienteForm } from '../cliente-form';

export const metadata: Metadata = { title: 'Cliente' };

export default async function ClientePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { id } = await params;
  const { novo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from('empresas_clientes').select('*').eq('id', id).maybeSingle();
  if (!e) notFound();
  const { data: perfil } = await supabase.from('perfis_usuario').select('login, nome_exibicao, bloqueado, deve_trocar_senha, senha_expira_em, primeiro_acesso_em').eq('empresa_cliente_id', id).maybeSingle();

  let precos: React.ReactNode = null;
  if (e.usa_tabela_propria) {
    const [{ data: servicos }, { data: categorias }, { data: proprios }, { data: padrao }] = await Promise.all([
      supabase.from('servicos').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('categorias_veiculo').select('id, nome').order('ordem'),
      supabase.from('precos_cliente').select('servico_id, categoria_id, valor').eq('empresa_cliente_id', id),
      supabase.from('precos').select('servico_id, categoria_id, valor'),
    ]);
    const mapa = (l: { servico_id: string; categoria_id: string; valor: number }[] | null) => Object.fromEntries((l ?? []).map((p) => [`${p.servico_id}:${p.categoria_id}`, Number(p.valor)]));
    precos = (
      <section className="card space-y-4 p-6">
        <div><h2 className="h3">Tabela de preços própria</h2><p className="mt-1 text-sm text-text-secondary">Sobrepõe a tabela padrão para este cliente.</p></div>
        <PrecosMatriz empresaId={id} servicos={servicos ?? []} categorias={categorias ?? []} valores={mapa(proprios)} padrao={mapa(padrao)} />
      </section>
    );
  }

  const nome = e.nome_fantasia || e.razao_social;
  return (
    <>
      <Link href="/loja/clientes" className="btn btn-texto btn-sm -ml-3 mb-2">← Clientes</Link>
      <Cabecalho kicker={formatarCnpj(e.cnpj)} titulo={nome} descricao={e.nome_fantasia ? e.razao_social : undefined} />
      {novo && !perfil && <div className="mb-6"><Aviso tipo="ok" titulo="Cliente cadastrado">Agora gere o acesso da empresa logo abaixo.</Aviso></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_420px] xl:items-start">
        <div className="space-y-6">
          <ClienteForm id={id} inicial={e} />
          {precos}
        </div>
        <div className="xl:sticky xl:top-6">
          <AcessoCliente empresaId={id} perfil={perfil} loginSugerido={sugerirLogin(nome)} responsavel={e.responsavel_acesso ?? ''} />
        </div>
      </div>
    </>
  );
}
