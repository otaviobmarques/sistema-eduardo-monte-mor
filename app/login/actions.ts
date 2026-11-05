'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loginParaEmail, normalizarLogin } from '@/lib/login';

const schema = z.object({ login: z.string().trim().min(1, 'Informe o usuário'), senha: z.string().min(1, 'Informe a senha') });

export type LoginState = { erro?: string } | undefined;

const MAX_TENTATIVAS = 5;
const JANELA_MIN = 15;

export async function entrar(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ login: form.get('login'), senha: form.get('senha') });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
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
  if ((porLogin.count ?? 0) >= MAX_TENTATIVAS || (porIp.count ?? 0) >= MAX_TENTATIVAS) {
    return { erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: loginParaEmail(login), password: parsed.data.senha });
  const registrar = (sucesso: boolean, userId?: string) =>
    admin.from('acessos_log').insert({ login, ip, user_agent: ua, sucesso, user_id: userId ?? null });

  if (error || !data.user) {
    await registrar(false);
    return { erro: 'Usuário ou senha incorretos.' };
  }

  const { data: perfil } = await admin.from('perfis_usuario').select('perfil, bloqueado, deve_trocar_senha, senha_expira_em').eq('user_id', data.user.id).maybeSingle();
  if (!perfil || perfil.bloqueado) {
    await supabase.auth.signOut();
    await registrar(false, data.user.id);
    return { erro: perfil ? 'Acesso bloqueado. Fale com a Auto Visão.' : 'Usuário sem perfil configurado.' };
  }
  if (perfil.deve_trocar_senha && perfil.senha_expira_em && new Date(perfil.senha_expira_em) < new Date()) {
    await supabase.auth.signOut();
    await registrar(false, data.user.id);
    return { erro: 'Sua senha temporária expirou. Peça uma nova à Auto Visão.' };
  }
  await registrar(true, data.user.id);
  redirect(perfil.deve_trocar_senha ? '/trocar-senha' : perfil.perfil === 'loja' ? '/loja' : '/app');
}

export async function sair() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
