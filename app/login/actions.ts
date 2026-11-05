'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginParaEmail, normalizarLogin } from '@/lib/login';
import { CONTATO_GESTOR } from '@/lib/contato';
import { telefone } from '@/lib/formato';
import { ROTA_INICIAL, type TipoPerfil } from '@/lib/sessao';

const FALE = `Fale com ${CONTATO_GESTOR.nome}: ${CONTATO_GESTOR.telefone}.`;

const schema = z.object({ login: z.string().trim().min(1, 'Informe o usuário'), senha: z.string().min(1, 'Informe a senha') });

export type LoginState = { erro?: string; login?: string } | undefined;

// Rate limit: 5 falhas por usuário em 15 min; por IP, 20 (um escritório atrás do mesmo IP não trava todo mundo
// por causa de um colega, mas uma varredura de vários usuários a partir de um IP é contida).
const MAX_TENTATIVAS = 5;
const MAX_POR_IP = 20;
const JANELA_MIN = 15;

export async function entrar(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ login: form.get('login'), senha: form.get('senha') });
  const digitado = String(form.get('login') ?? '');
  if (!parsed.success) return { erro: parsed.error.issues[0].message, login: digitado };
  const login = normalizarLogin(parsed.data.login);
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'desconhecido';
  const ua = h.get('user-agent') ?? '';

  const admin = createAdminClient();
  const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString();
  const [porLogin, porIp] = await Promise.all([
    admin.from('acessos_log').select('id', { count: 'exact', head: true }).eq('login', login).eq('sucesso', false).gte('em', desde),
    admin.from('acessos_log').select('id', { count: 'exact', head: true }).eq('ip', ip).eq('sucesso', false).gte('em', desde),
  ]);
  const registrar = async (sucesso: boolean, motivo: string | null, userId?: string) => {
    const q = admin.from('perfis_usuario').select('loja_id');
    const { data: p } = await (userId ? q.eq('user_id', userId) : q.eq('login', login)).maybeSingle();
    return admin.from('acessos_log').insert({ login, ip, user_agent: ua.slice(0, 400), sucesso, motivo, user_id: userId ?? null, loja_id: p?.loja_id ?? null });
  };
  if ((porLogin.count ?? 0) >= MAX_TENTATIVAS || (porIp.count ?? 0) >= MAX_POR_IP) {
    await registrar(false, 'limite de tentativas');
    return { erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.`, login: digitado };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginParaEmail(login), password: parsed.data.senha });

  if (error || !data.user) {
    const banido = error?.code === 'user_banned' || /banned/i.test(error?.message ?? '');
    await registrar(false, banido ? 'acesso bloqueado' : 'usuário ou senha incorretos');
    if (banido) {
      const { data: pb } = await admin.from('perfis_usuario').select('perfil, lojas(nome, telefone)').eq('login', login).maybeSingle();
      const lb = pb?.lojas as unknown as { nome: string; telefone: string | null } | null;
      const quem = pb?.perfil === 'cliente' && lb ? `Fale com a ${lb.nome}${lb.telefone ? `: ${telefone(lb.telefone)}` : ''}.` : pb?.perfil === 'loja' ? 'Fale com o administrador do sistema.' : FALE;
      return { erro: `Acesso bloqueado. ${quem}`, login: digitado };
    }
    return { erro: 'Usuário ou senha incorretos.', login: digitado };
  }

  const { data: perfil } = await admin.from('perfis_usuario').select('perfil, bloqueado, deve_trocar_senha, senha_expira_em, loja_id, lojas(nome, ativo, bloqueada, telefone)').eq('user_id', data.user.id).maybeSingle();
  const lojaP = perfil?.lojas as unknown as { nome: string; telefone: string | null } | null;
  const contato = perfil?.perfil === 'cliente' && lojaP ? `Fale com a ${lojaP.nome}${lojaP.telefone ? `: ${telefone(lojaP.telefone)}` : ''}.` : perfil?.perfil === 'loja' ? 'Fale com o administrador do sistema.' : FALE;
  if (!perfil || perfil.bloqueado) {
    await supabase.auth.signOut();
    await registrar(false, perfil ? 'acesso bloqueado' : 'sem perfil', data.user.id);
    return { erro: perfil ? `Acesso bloqueado. ${contato}` : 'Usuário sem perfil configurado.', login: digitado };
  }
  if (perfil.deve_trocar_senha && perfil.senha_expira_em && new Date(perfil.senha_expira_em) < new Date()) {
    await supabase.auth.signOut();
    await registrar(false, 'senha temporária expirada', data.user.id);
    return { erro: `Sua senha temporária expirou. ${contato}`, login: digitado };
  }
  const loja = perfil.lojas as unknown as { nome: string; ativo: boolean; bloqueada: boolean; telefone: string | null } | null;
  if (perfil.loja_id && (!loja?.ativo || loja.bloqueada)) {
    await supabase.auth.signOut();
    await registrar(false, 'loja suspensa', data.user.id);
    return { erro: perfil.perfil === 'loja' ? 'O acesso da sua Loja está suspenso. Regularize a assinatura com o administrador do sistema.' : `O sistema está temporariamente indisponível. Fale com a ${loja?.nome || 'sua unidade Auto Visão'}${loja?.telefone ? `: ${telefone(loja.telefone)}` : ''}.`, login: digitado };
  }
  await registrar(true, null, data.user.id);
  redirect(perfil.deve_trocar_senha ? '/trocar-senha' : ROTA_INICIAL[perfil.perfil as TipoPerfil]);
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
