'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mensagemErroBanco, type Resultado } from '@/lib/cadastros';
import { cnpjValido, normalizarCnpj } from '@/lib/regras/cnpj';
import { UFS } from '@/lib/formato';
import { gerarSenhaTemporaria, LOGIN_REGEX, loginParaEmail, normalizarLogin } from '@/lib/login';

const opcional = z.string().trim().optional().transform((v) => (v ? v : null));

const clienteSchema = z.object({
  cnpj: z.string().transform(normalizarCnpj).refine(cnpjValido, 'CNPJ inválido. Confira os 14 dígitos.'),
  razao_social: z.string().trim().min(2, 'Informe a razão social.'),
  nome_fantasia: opcional,
  cep: z.string().optional().transform((v) => (v ? v.replace(/\D/g, '') || null : null)),
  endereco: opcional,
  cidade: opcional,
  uf: z.string().optional().transform((v) => (v ? v.toUpperCase() : null)).refine((v) => !v || UFS.includes(v), 'Selecione a UF.'),
  telefone: z.string().optional().transform((v) => (v ? v.replace(/\D/g, '') || null : null))
    .refine((v) => !v || v.length === 10 || v.length === 11, 'Informe um telefone com DDD.'),
  email: z.string().trim().optional().transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Informe um e-mail válido.'),
  responsavel_financeiro: opcional,
  responsavel_acesso: opcional,
  forma_cobranca: z.enum(['faturado', 'avulso']),
  usa_tabela_propria: z.coerce.boolean(),
  sla_horas: z.coerce.number().int('Use horas inteiras.').min(1, 'Mínimo de 1 hora.').max(48, 'O SLA nunca passa de 48 horas.'),
  ativo: z.coerce.boolean(),
});
export type ClienteDados = z.input<typeof clienteSchema>;

export async function salvarCliente(id: string | null, dados: ClienteDados): Promise<Resultado<{ id: string }>> {
  const s = await exigirPerfil('loja');
  const parsed = clienteSchema.safeParse(dados);
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const i of parsed.error.issues) campos[String(i.path[0])] ??= i.message;
    return { ok: false, erro: 'Confira os campos destacados.', campos };
  }
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('empresas_clientes').update(parsed.data).eq('id', id);
    if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe um cliente com este CNPJ.' : mensagemErroBanco(error) };
    revalidatePath(`/loja/clientes/${id}`);
    revalidatePath('/loja/clientes');
    return { ok: true, dados: { id } };
  }
  const { data, error } = await supabase.from('empresas_clientes').insert({ ...parsed.data, created_by: s.userId }).select('id').single();
  if (error || !data) return { ok: false, erro: error?.code === '23505' ? 'Já existe um cliente com este CNPJ.' : mensagemErroBanco(error) };
  revalidatePath('/loja/clientes');
  return { ok: true, dados: { id: data.id } };
}

/* ───────── BrasilAPI / ViaCEP ───────── */

const HEADERS = { 'User-Agent': 'SistemaOS-AutoVisao/1.0', Accept: 'application/json' };

export interface DadosCnpj {
  razao_social: string; nome_fantasia: string; cep: string; endereco: string; cidade: string; uf: string; telefone: string; email: string;
}

export async function consultarCnpj(cnpj: string): Promise<Resultado<DadosCnpj>> {
  await exigirPerfil('loja');
  const c = normalizarCnpj(cnpj);
  if (!cnpjValido(c)) return { ok: false, erro: 'CNPJ inválido. Confira os 14 dígitos.' };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`, { cache: 'no-store', headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (r.status === 404) return { ok: false, erro: 'CNPJ não encontrado na Receita. Preencha os dados manualmente.' };
    if (!r.ok) return { ok: false, erro: 'A consulta de CNPJ está indisponível agora. Preencha os dados manualmente.' };
    const j = await r.json();
    const endereco = [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ')
      + (j.numero ? `, ${j.numero}` : '') + (j.complemento ? ` – ${j.complemento}` : '') + (j.bairro ? ` – ${j.bairro}` : '');
    const tel = String(j.ddd_telefone_1 ?? '').replace(/\D/g, '');
    return {
      ok: true,
      dados: {
        razao_social: j.razao_social ?? '', nome_fantasia: j.nome_fantasia ?? '', cep: String(j.cep ?? '').replace(/\D/g, ''),
        endereco: titulo(endereco.trim()), cidade: j.municipio ? titulo(j.municipio) : '', uf: j.uf ?? '', telefone: tel, email: (j.email ?? '').toLowerCase(),
      },
    };
  } catch {
    return { ok: false, erro: 'A consulta de CNPJ não respondeu. Preencha os dados manualmente.' };
  }
}

export async function consultarCep(cep: string): Promise<Resultado<{ endereco: string; cidade: string; uf: string }>> {
  await exigirPerfil('loja');
  const c = cep.replace(/\D/g, '');
  if (c.length !== 8) return { ok: false, erro: 'Informe os 8 dígitos do CEP.' };
  try {
    const r = await fetch(`https://viacep.com.br/ws/${c}/json/`, { cache: 'no-store', headers: HEADERS, signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    if (!r.ok || j.erro) return { ok: false, erro: 'CEP não encontrado. Preencha o endereço manualmente.' };
    return { ok: true, dados: { endereco: [j.logradouro, j.bairro].filter(Boolean).join(' – '), cidade: j.localidade ?? '', uf: j.uf ?? '' } };
  } catch {
    return { ok: false, erro: 'A consulta de CEP não respondeu. Preencha o endereço manualmente.' };
  }
}

function titulo(s: string) {
  const menores = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'oeste"]);
  const siglas = new Set(['sp', 'rj', 'mg', 'pr', 'sc', 'rs', 'ba', 'df', 'go', 'es', 'ii', 'iii', 'iv']);
  return s.toLowerCase().split(' ').map((p, i) => (siglas.has(p) ? p.toUpperCase() : i > 0 && menores.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

/* ───────── Acesso do cliente (só o gestor) ───────── */

const SETE_DIAS = 7 * 24 * 3600 * 1000;

async function auditar(adminUserId: string, registroId: string, campo: string, de: string | null, para: string | null) {
  const admin = createAdminClient();
  await admin.from('auditoria').insert({ tabela: 'perfis_usuario', registro_id: registroId, campo, valor_anterior: de, valor_novo: para, usuario_id: adminUserId });
}

export async function gerarAcesso(empresaId: string, loginBruto: string, nome: string): Promise<Resultado<{ login: string; senha: string; expira: string }>> {
  const s = await exigirPerfil('loja');
  const login = normalizarLogin(loginBruto);
  if (!LOGIN_REGEX.test(login)) return { ok: false, erro: 'O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (ou ser um e-mail).' };
  const admin = createAdminClient();
  const { data: empresa } = await admin.from('empresas_clientes').select('id, razao_social, nome_fantasia, responsavel_acesso').eq('id', empresaId).single();
  if (!empresa) return { ok: false, erro: 'Cliente não encontrado.' };
  const { data: existente } = await admin.from('perfis_usuario').select('user_id').eq('empresa_cliente_id', empresaId).maybeSingle();
  if (existente) return { ok: false, erro: 'Este cliente já tem acesso. Use “Resetar senha”.' };
  const { data: emUso } = await admin.from('perfis_usuario').select('user_id').eq('login', login).maybeSingle();
  if (emUso) return { ok: false, erro: 'Este usuário já está em uso. Escolha outro.' };

  const senha = gerarSenhaTemporaria();
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: loginParaEmail(login), password: senha, email_confirm: true, user_metadata: { login, empresa_cliente_id: empresaId },
  });
  if (error || !criado.user) {
    return { ok: false, erro: error?.message?.includes('already') ? 'Este usuário já está em uso. Escolha outro.' : 'Não foi possível criar o acesso. Tente de novo.' };
  }
  const expira = new Date(Date.now() + SETE_DIAS).toISOString();
  const { error: e2 } = await admin.from('perfis_usuario').insert({
    user_id: criado.user.id, perfil: 'cliente', empresa_cliente_id: empresaId, login,
    nome_exibicao: nome.trim() || empresa.responsavel_acesso || empresa.nome_fantasia || empresa.razao_social,
    deve_trocar_senha: true, senha_expira_em: expira, bloqueado: false,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { ok: false, erro: 'Não foi possível criar o acesso. Tente de novo.' };
  }
  await auditar(s.userId, criado.user.id, 'acesso gerado', null, login);
  revalidatePath(`/loja/clientes/${empresaId}`);
  revalidatePath('/loja/clientes');
  return { ok: true, dados: { login, senha, expira } };
}

export async function resetarSenha(empresaId: string): Promise<Resultado<{ login: string; senha: string; expira: string }>> {
  const s = await exigirPerfil('loja');
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfis_usuario').select('user_id, login').eq('empresa_cliente_id', empresaId).maybeSingle();
  if (!p) return { ok: false, erro: 'Este cliente ainda não tem acesso.' };
  const senha = gerarSenhaTemporaria();
  const { error } = await admin.auth.admin.updateUserById(p.user_id, { password: senha });
  if (error) return { ok: false, erro: 'Não foi possível resetar a senha. Tente de novo.' };
  const expira = new Date(Date.now() + SETE_DIAS).toISOString();
  await admin.from('perfis_usuario').update({ deve_trocar_senha: true, senha_expira_em: expira }).eq('user_id', p.user_id);
  await auditar(s.userId, p.user_id, 'senha resetada', null, null);
  revalidatePath(`/loja/clientes/${empresaId}`);
  return { ok: true, dados: { login: p.login, senha, expira } };
}

export async function alterarBloqueio(empresaId: string, bloquear: boolean): Promise<Resultado> {
  const s = await exigirPerfil('loja');
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfis_usuario').select('user_id, bloqueado').eq('empresa_cliente_id', empresaId).maybeSingle();
  if (!p) return { ok: false, erro: 'Este cliente ainda não tem acesso.' };
  const { error } = await admin.from('perfis_usuario').update({ bloqueado: bloquear }).eq('user_id', p.user_id);
  if (error) return { ok: false, erro: 'Não foi possível alterar o acesso. Tente de novo.' };
  // Banir no Auth encerra as sessões abertas; desbanir libera o login de novo
  await admin.auth.admin.updateUserById(p.user_id, { ban_duration: bloquear ? '876000h' : 'none' });
  await auditar(s.userId, p.user_id, 'bloqueado', String(p.bloqueado), String(bloquear));
  revalidatePath(`/loja/clientes/${empresaId}`);
  revalidatePath('/loja/clientes');
  return { ok: true };
}
