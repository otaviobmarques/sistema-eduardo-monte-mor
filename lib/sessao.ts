import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type TipoPerfil = 'admin' | 'loja' | 'cliente' | 'vistoriador';

export interface Perfil {
  user_id: string;
  perfil: TipoPerfil;
  loja_id: string | null;
  empresa_cliente_id: string | null;
  /** Perfil vistoriador: o cadastro de vistoriador ligado a este login. */
  vistoriador_id?: string | null;
  login: string;
  nome_exibicao: string;
  deve_trocar_senha: boolean;
  senha_expira_em: string | null;
  bloqueado: boolean;
  /** Gestor que conclui OS sem travas (motivo, pendência, justificativa de atraso). */
  conclusao_livre?: boolean;
}

export interface Sessao {
  userId: string;
  perfil: Perfil;
  loja: { id: string; nome: string; telefone: string | null; bloqueada: boolean; ativo: boolean } | null;
  empresa: { id: string; razao_social: string; nome_fantasia: string | null } | null;
}

export const ROTA_INICIAL: Record<TipoPerfil, string> = { admin: '/admin', loja: '/loja', cliente: '/app', vistoriador: '/vistoriador' };

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

/** Gestor de uma Loja ativa mas bloqueada por atraso: entra só para pagar (Assinatura). */
export const lojaSoPagamento = (s: Sessao) => s.perfil.perfil === 'loja' && !!s.loja?.ativo && !!s.loja?.bloqueada;

/**
 * Garante sessão válida, perfil certo, não bloqueado, Loja em dia e senha já trocada.
 * Loja bloqueada: o Gestor é levado à Assinatura (só ela aceita `permitirLojaBloqueada`); os clientes ficam de fora.
 */
/**
 * Sem sessão reconhecida no servidor. Se o navegador ainda tem o cookie da sessão, manda para /sessao, que renova pelo
 * navegador e volta à página (evita “deslogar sozinho” quando a renovação do acesso falha no servidor, comum no iPhone).
 */
export async function semSessao(): Promise<never> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const nomes = jar.getAll().filter((c) => c.name.includes('-auth-token') && c.value).map((c) => c.name);
  const caminho = h.get('x-url') ?? h.get('x-caminho') ?? '/';
  console.log(JSON.stringify({ diag: 'sem-sessao', onde: 'servidor', path: caminho, recuperar: nomes.length > 0, cookies: nomes, ua: h.get('user-agent')?.slice(0, 120) }));
  if (nomes.length) redirect(`/sessao?volta=${encodeURIComponent(caminho)}`);
  redirect('/login');
}

export async function exigirPerfil(perfil: TipoPerfil, opcoes: { permitirLojaBloqueada?: boolean } = {}): Promise<Sessao> {
  const s = await getSessao();
  if (!s) return semSessao();
  if (s.perfil.bloqueado) redirect('/login?erro=bloqueado');
  if (s.loja && lojaSoPagamento(s)) {
    if (!opcoes.permitirLojaBloqueada) redirect('/loja/assinatura');
  } else if (s.loja && (s.loja.bloqueada || !s.loja.ativo)) redirect('/login?erro=loja_suspensa');
  if (s.perfil.deve_trocar_senha) redirect('/trocar-senha');
  if (s.perfil.perfil !== perfil) redirect(ROTA_INICIAL[s.perfil.perfil]);
  return s;
}

export async function exigirUmDe(perfis: TipoPerfil[]): Promise<Sessao> {
  const s = await getSessao();
  if (!s) return semSessao();
  if (s.perfil.bloqueado || s.perfil.deve_trocar_senha || !perfis.includes(s.perfil.perfil)) redirect(ROTA_INICIAL[s.perfil.perfil]);
  return s;
}
