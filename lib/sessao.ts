import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface Perfil {
  user_id: string;
  perfil: 'loja' | 'cliente';
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
  empresa: { id: string; razao_social: string; nome_fantasia: string | null } | null;
}

export const getSessao = cache(async (): Promise<Sessao | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('perfis_usuario').select('*').eq('user_id', user.id).maybeSingle<Perfil>();
  if (!perfil) return null;
  let empresa: Sessao['empresa'] = null;
  if (perfil.empresa_cliente_id) {
    const { data } = await supabase.from('empresas_clientes').select('id, razao_social, nome_fantasia').eq('id', perfil.empresa_cliente_id).maybeSingle();
    empresa = data;
  }
  return { userId: user.id, perfil, empresa };
});

/** Garante sessão válida, perfil certo, não bloqueado e senha já trocada. */
export async function exigirPerfil(perfil: 'loja' | 'cliente'): Promise<Sessao> {
  const s = await getSessao();
  if (!s) redirect('/login');
  if (s.perfil.bloqueado) redirect('/login?erro=bloqueado');
  if (s.perfil.deve_trocar_senha) redirect('/trocar-senha');
  if (s.perfil.perfil !== perfil) redirect(s.perfil.perfil === 'loja' ? '/loja' : '/app');
  return s;
}
