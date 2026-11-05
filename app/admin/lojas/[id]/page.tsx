import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AcessoCliente } from '@/app/loja/clientes/acesso';
import { Aviso, Cabecalho } from '@/components/ui';
import { ambienteAsaas, asaasConfigurado } from '@/lib/asaas';
import { sugerirLogin } from '@/lib/formato';
import { formatarCnpj } from '@/lib/regras/cnpj';
import { createClient } from '@/lib/supabase/server';
import { bloquearGestor, gerarAcessoGestor, resetarSenhaGestor } from '../../actions';
import { CobrancaLoja, SituacaoLoja, type FaturaVista } from '../../componentes';
import { LojaForm } from '../../loja-form';

export const metadata: Metadata = { title: 'Loja' };

export default async function LojaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const [{ id }, { nova }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: l } = await supabase.from('lojas').select('*').eq('id', id).maybeSingle();
  if (!l) notFound();
  const [{ data: gestor }, { data: faturas }] = await Promise.all([
    supabase.from('perfis_usuario').select('login, nome_exibicao, bloqueado, deve_trocar_senha, senha_expira_em, primeiro_acesso_em').eq('loja_id', id).eq('perfil', 'loja').maybeSingle(),
    supabase.from('faturas').select('id, tipo, descricao, valor, vencimento, status, link_pagamento, pago_em, asaas_payment_id').eq('loja_id', id).order('vencimento', { ascending: false }),
  ]);
  return (
    <>
      <Link href="/admin" className="btn btn-texto btn-sm -ml-3 mb-2">← Lojas</Link>
      <Cabecalho kicker={l.cnpj ? formatarCnpj(l.cnpj) : 'Loja franqueada'} titulo={l.nome} descricao={[l.cidade, l.uf].filter(Boolean).join(' / ') || undefined} />
      {nova && !gestor && <div className="mb-6"><Aviso tipo="ok" titulo="Loja cadastrada">Agora gere o acesso do Gestor e ative a cobrança.</Aviso></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_440px] xl:items-start">
        <div className="space-y-6">
          <LojaForm id={id} inicial={l} />
          <CobrancaLoja loja={{ id, nome: l.nome, temCnpj: !!l.cnpj }} faturas={(faturas ?? []) as FaturaVista[]} asaasAtivo={await asaasConfigurado()} temAssinatura={!!l.asaas_subscription_id} ambiente={await ambienteAsaas()} />
        </div>
        <div className="space-y-6 xl:sticky xl:top-6">
          <AcessoCliente empresaId={id} perfil={gestor} titulo="Acesso do Gestor" descricao="Um Gestor por Loja: cadastra clientes, opera as OS e gerencia a Loja."
            loginSugerido={sugerirLogin(l.responsavel || l.nome)} responsavel={l.responsavel ?? ''}
            acoes={{ gerar: gerarAcessoGestor.bind(null, id), resetar: resetarSenhaGestor.bind(null, id), bloquear: bloquearGestor.bind(null, id) }} />
          <SituacaoLoja lojaId={id} bloqueada={l.bloqueada} motivo={l.motivo_bloqueio} automatico={l.bloqueio_automatico} desde={l.bloqueada_em} />
        </div>
      </div>
    </>
  );
}
