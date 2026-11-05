import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type TipoPerfil = 'admin' | 'loja' | 'cliente';

export interface Perfil {
  user_id: string;
  perfil: TipoPerfil;
  loja_id: string | null;
  empresa_cliente_id: string | null;
  login: string;
  nome_exibicao: string;
  deve_trocar_senha: boolean;
  senha_expira_em: string | null;
  bloqueado: boolean;
}

export interface Sessao {
  userId: string;
  perfil: Perfil;
  loja: { id: string; nome: string; telefone: string | null; bloqueada: boolean; ativo: boolean } | null;
  empresa: { id: string; razao_social: string; nome_fantasia: string | null } | null;
}

export const ROTA_INICIAL: Record<TipoPerfil, string> = { admin: '/admin', loja: '/loja', cliente: '/app' };

export const getSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('perfis_usuario').select('*').eq('user_id', user.id).maybeSingle<Perfil>();
  if (!perfil) return null;
  let empresa: Sessao['empresa'] = null;
  let loja: Sessao['loja'] = null;
  if (perfil.loja_id) {
    const { data } = await supabase.from('lojas').select('id, nome, telefone, bloqueada, ativo').eq('id', perfil.loja_id).maybeSingle();
    // RLS só devolve a própria Loja quando ela está ativa e em dia; ausência = suspensa
    loja = data ?? { id: perfil.loja_id, nome: '', telefone: null, bloqueada: true, ativo: false };
  }
  if (perfil.empresa_cliente_id) {
    const { data } = await supabase.from('empresas_clientes').select('id, razao_social, nome_fantasia').eq('id', perfil.empresa_cliente_id).maybeSingle();
    empresa = data;
  }
  return { userId: user.id, perfil, loja, empresa };
});

/** Garante sessão válida, perfil certo, não bloqueado, Loja em dia e senha já trocada. */
export async function exigirPerfil(perfil: TipoPerfil): Promise<Sessao> {
  const s = await getSessao();
  if (!s) redirect('/login');
  if (s.perfil.bloqueado) redirect('/login?erro=bloqueado');
  if (s.loja && (s.loja.bloqueada || !s.loja.ativo)) redirect('/login?erro=loja_suspensa');
  if (s.perfil.deve_trocar_senha) redirect('/trocar-senha');
  if (s.perfil.perfil !== perfil) redirect(ROTA_INICIAL[s.perfil.perfil]);
  return s;
}

export async function exigirUmDe(perfis: TipoPerfil[]): Promise<Sessao> {
  const s = await getSessao();
  if (!s) redirect('/login');
  if (s.perfil.bloqueado || s.perfil.deve_trocar_senha || !perfis.includes(s.perfil.perfil)) redirect(ROTA_INICIAL[s.perfil.perfil]);
  return s;
}
