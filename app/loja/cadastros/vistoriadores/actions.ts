'use server';
import { revalidatePath } from 'next/cache';
import { exigirPerfil } from '@/lib/sessao';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Resultado } from '@/lib/cadastros';
import { LOGIN_REGEX, loginParaEmail, normalizarLogin } from '@/lib/login';

const ROTA = '/loja/cadastros/vistoriadores';

function senhaValida(senha: string) {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (senha.length > 72) return 'Use no máximo 72 caracteres.';
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
  return null;
}

async function auditar(userId: string, lojaId: string | null, registroId: string, campo: string, de: string | null, para: string | null) {
  await createAdminClient().from('auditoria').insert({ tabela: 'perfis_usuario', registro_id: registroId, campo, valor_anterior: de, valor_novo: para, usuario_id: userId, loja_id: lojaId });
}

async function vistoriadorDaLoja(lojaId: string, vistoriadorId: string) {
  const { data } = await createAdminClient().from('vistoriadores').select('id, nome, ativo').eq('id', vistoriadorId).eq('loja_id', lojaId).maybeSingle();
  return data;
}

/** O Gestor cria o login do vistoriador com a senha que ele mesmo escolhe (sem troca obrigatória no 1º acesso). */
export async function criarAcessoVistoriador(vistoriadorId: string, loginBruto: string, senha: string): Promise<Resultado<{ login: string }>> {
  const s = await exigirPerfil('loja');
  const login = normalizarLogin(loginBruto);
  if (!LOGIN_REGEX.test(login)) return { ok: false, erro: 'O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado.', campos: { login: 'Usuário inválido.' } };
  const erroSenha = senhaValida(senha);
  if (erroSenha) return { ok: false, erro: erroSenha, campos: { senha: erroSenha } };
  const vist = await vistoriadorDaLoja(s.perfil.loja_id!, vistoriadorId);
  if (!vist) return { ok: false, erro: 'Vistoriador não encontrado.' };
  if (!vist.ativo) return { ok: false, erro: 'Ative o vistoriador antes de criar o acesso.' };
  const admin = createAdminClient();
  const { data: existente } = await admin.from('perfis_usuario').select('user_id').eq('vistoriador_id', vistoriadorId).maybeSingle();
  if (existente) return { ok: false, erro: 'Este vistoriador já tem acesso. Use “Alterar senha”.' };
  const { data: emUso } = await admin.from('perfis_usuario').select('user_id').eq('login', login).maybeSingle();
  if (emUso) return { ok: false, erro: 'Este usuário já está em uso. Escolha outro.', campos: { login: 'Já está em uso.' } };

  const { data: criado, error } = await admin.auth.admin.createUser({ email: loginParaEmail(login), password: senha, email_confirm: true, user_metadata: { login, vistoriador_id: vistoriadorId } });
  if (error || !criado.user) {
    return { ok: false, erro: error?.message?.includes('already') ? 'Este usuário já está em uso. Escolha outro.' : /password/i.test(error?.message ?? '') ? 'Senha fraca ou muito comum. Escolha outra.' : 'Não foi possível criar o acesso. Tente de novo.' };
  }
  const { error: e2 } = await admin.from('perfis_usuario').insert({
    user_id: criado.user.id, perfil: 'vistoriador', loja_id: s.perfil.loja_id, vistoriador_id: vistoriadorId, login,
    nome_exibicao: vist.nome, deve_trocar_senha: false, senha_expira_em: null, bloqueado: false,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: 'Não foi possível criar o acesso. Tente de novo.' };
  }
  await auditar(s.userId, s.perfil.loja_id, criado.user.id, 'acesso do vistoriador criado', null, login);
  revalidatePath(ROTA);
  return { ok: true, dados: { login } };
}

export async function alterarSenhaVistoriador(vistoriadorId: string, senha: string): Promise<Resultado<{ login: string }>> {
  const s = await exigirPerfil('loja');
  const erroSenha = senhaValida(senha);
  if (erroSenha) return { ok: false, erro: erroSenha, campos: { senha: erroSenha } };
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfis_usuario').select('user_id, login').eq('vistoriador_id', vistoriadorId).eq('loja_id', s.perfil.loja_id!).maybeSingle();
  if (!p) return { ok: false, erro: 'Este vistoriador ainda não tem acesso.' };
  const { error } = await admin.auth.admin.updateUserById(p.user_id, { password: senha });
  if (error) return { ok: false, erro: /password/i.test(error.message) ? 'Senha fraca ou muito comum. Escolha outra.' : 'Não foi possível alterar a senha. Tente de novo.' };
  await auditar(s.userId, s.perfil.loja_id, p.user_id, 'senha do vistoriador alterada', null, null);
  revalidatePath(ROTA);
  return { ok: true, dados: { login: p.login } };
}

export async function bloquearVistoriador(vistoriadorId: string, bloquear: boolean): Promise<Resultado> {
  const s = await exigirPerfil('loja');
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfis_usuario').select('user_id, bloqueado').eq('vistoriador_id', vistoriadorId).eq('loja_id', s.perfil.loja_id!).maybeSingle();
  if (!p) return { ok: false, erro: 'Este vistoriador ainda não tem acesso.' };
  const { error } = await admin.from('perfis_usuario').update({ bloqueado: bloquear }).eq('user_id', p.user_id);
  if (error) return { ok: false, erro: 'Não foi possível alterar o acesso. Tente de novo.' };
  await admin.auth.admin.updateUserById(p.user_id, { ban_duration: bloquear ? '876000h' : 'none' });
  await auditar(s.userId, s.perfil.loja_id, p.user_id, 'bloqueado', String(p.bloqueado), String(bloquear));
  revalidatePath(ROTA);
  return { ok: true };
}
