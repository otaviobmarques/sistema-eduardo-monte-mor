'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { asaas, asaasConfigurado, ErroAsaas, proximoVencimento, statusFatura } from '@/lib/asaas';
import { cnpjValido, normalizarCnpj } from '@/lib/regras/cnpj';
import { UFS } from '@/lib/formato';
import { gerarSenhaTemporaria, LOGIN_REGEX, loginParaEmail, normalizarLogin } from '@/lib/login';
import { mensagemErroBanco, type Resultado } from '@/lib/cadastros';

const opcional = z.string().trim().optional().transform((v) => (v ? v : null));
const dinheiro = z.coerce.number({ invalid_type_error: 'Informe um valor.' }).min(0, 'Não pode ser negativo.');

const lojaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da Loja (ex.: Auto Visão Campinas).'),
  razao_social: opcional,
  cnpj: z.string().optional().transform((v) => normalizarCnpj(v) || null).refine((v) => !v || cnpjValido(v), 'CNPJ inválido.'),
  endereco: opcional, cidade: opcional, cep: opcional,
  uf: z.string().optional().transform((v) => (v ? v.toUpperCase() : null)).refine((v) => !v || UFS.includes(v), 'Selecione a UF.'),
  telefone: z.string().optional().transform((v) => (v ?? '').replace(/\D/g, '') || null),
  email: z.string().trim().optional().transform((v) => (v ? v.toLowerCase() : null)).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.'),
  responsavel: opcional,
  plano_mensal: dinheiro, taxa_start: dinheiro,
  dia_vencimento: z.coerce.number().int().min(1, 'Entre 1 e 28.').max(28, 'Entre 1 e 28.'),
  dias_tolerancia: z.coerce.number().int().min(0, 'Mínimo 0.').max(60, 'Máximo 60 dias.'),
  ativo: z.coerce.boolean(),
});
export type LojaDados = z.input<typeof lojaSchema>;

function campos(e: z.ZodError) { const c: Record<string, string> = {}; for (const i of e.issues) c[String(i.path[0])] ??= i.message; return c; }

export async function salvarLoja(id: string | null, dados: LojaDados): Promise<Resultado<{ id: string }>> {
  await exigirPerfil('admin');
  const p = lojaSchema.safeParse(dados);
  if (!p.success) return { ok: false, erro: 'Confira os campos destacados.', campos: campos(p.error) };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from('lojas').update(p.data).eq('id', id);
    if (error) return { ok: false, erro: error.code === '23505' ? 'Já existe uma Loja com este CNPJ.' : mensagemErroBanco(error) };
    revalidatePath(`/admin/lojas/${id}`); revalidatePath('/admin');
    return { ok: true, dados: { id } };
  }
  const { data, error } = await supabase.from('lojas').insert(p.data).select('id').single();
  if (error || !data) return { ok: false, erro: error?.code === '23505' ? 'Já existe uma Loja com este CNPJ.' : mensagemErroBanco(error) };
  const { error: e2 } = await supabase.rpc('semear_loja', { p_loja: data.id });
  if (e2) return { ok: false, erro: 'Loja criada, mas não foi possível preparar os cadastros padrão.' };
  revalidatePath('/admin');
  return { ok: true, dados: { id: data.id } };
}

/* ───────── Acesso do Gestor da Loja ───────── */
const SETE_DIAS = 7 * 24 * 3600 * 1000;
type Cred = { login: string; senha: string; expira: string };

async function auditar(adminId: string, lojaId: string, registro: string, campo: string, de: string | null, para: string | null) {
  await createAdminClient().from('auditoria').insert({ tabela: 'perfis_usuario', registro_id: registro, campo, valor_anterior: de, valor_novo: para, usuario_id: adminId, loja_id: lojaId });
}

export async function gerarAcessoGestor(lojaId: string, loginBruto: string, nome: string): Promise<Resultado<Cred>> {
  const s = await exigirPerfil('admin');
  const login = normalizarLogin(loginBruto);
  if (!LOGIN_REGEX.test(login)) return { ok: false, erro: 'O usuário deve ter de 3 a 40 letras minúsculas, números, ponto, hífen ou sublinhado (ou ser um e-mail).' };
  const admin = createAdminClient();
  const { data: loja } = await admin.from('lojas').select('id, nome, responsavel').eq('id', lojaId).single();
  if (!loja) return { ok: false, erro: 'Loja não encontrada.' };
  const { data: existente } = await admin.from('perfis_usuario').select('user_id').eq('loja_id', lojaId).eq('perfil', 'loja').maybeSingle();
  if (existente) return { ok: false, erro: 'Esta Loja já tem Gestor. Use “Resetar senha”.' };
  const { data: emUso } = await admin.from('perfis_usuario').select('user_id').eq('login', login).maybeSingle();
  if (emUso) return { ok: false, erro: 'Este usuário já está em uso. Escolha outro.' };
  const senha = gerarSenhaTemporaria();
  const { data: u, error } = await admin.auth.admin.createUser({ email: loginParaEmail(login), password: senha, email_confirm: true, user_metadata: { login, loja_id: lojaId } });
  if (error || !u.user) return { ok: false, erro: error?.message?.includes('already') ? 'Este usuário já está em uso. Escolha outro.' : 'Não foi possível criar o acesso.' };
  const expira = new Date(Date.now() + SETE_DIAS).toISOString();
  const { error: e2 } = await admin.from('perfis_usuario').insert({
    user_id: u.user.id, perfil: 'loja', loja_id: lojaId, login, nome_exibicao: nome.trim() || loja.responsavel || loja.nome,
    deve_trocar_senha: true, senha_expira_em: expira,
  });
  if (e2) { await admin.auth.admin.deleteUser(u.user.id); return { ok: false, erro: 'Não foi possível criar o acesso.' }; }
  await auditar(s.userId, lojaId, u.user.id, 'acesso gerado', null, login);
  revalidatePath(`/admin/lojas/${lojaId}`);
  return { ok: true, dados: { login, senha, expira } };
}

export async function resetarSenhaGestor(lojaId: string): Promise<Resultado<Cred>> {
  const s = await exigirPerfil('admin');
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfis_usuario').select('user_id, login').eq('loja_id', lojaId).eq('perfil', 'loja').maybeSingle();
  if (!p) return { ok: false, erro: 'Esta Loja ainda não tem Gestor.' };
  const senha = gerarSenhaTemporaria();
  const { error } = await admin.auth.admin.updateUserById(p.user_id, { password: senha });
  if (error) return { ok: false, erro: 'Não foi possível resetar a senha.' };
  const expira = new Date(Date.now() + SETE_DIAS).toISOString();
  await admin.from('perfis_usuario').update({ deve_trocar_senha: true, senha_expira_em: expira }).eq('user_id', p.user_id);
  await auditar(s.userId, lojaId, p.user_id, 'senha resetada', null, null);
  revalidatePath(`/admin/lojas/${lojaId}`);
  return { ok: true, dados: { login: p.login, senha, expira } };
}

export async function bloquearGestor(lojaId: string, bloquear: boolean): Promise<Resultado> {
  const s = await exigirPerfil('admin');
  const admin = createAdminClient();
  const { data: p } = await admin.from('perfis_usuario').select('user_id, bloqueado').eq('loja_id', lojaId).eq('perfil', 'loja').maybeSingle();
  if (!p) return { ok: false, erro: 'Esta Loja ainda não tem Gestor.' };
  await admin.from('perfis_usuario').update({ bloqueado: bloquear }).eq('user_id', p.user_id);
  await admin.auth.admin.updateUserById(p.user_id, { ban_duration: bloquear ? '876000h' : 'none' });
  await auditar(s.userId, lojaId, p.user_id, 'bloqueado', String(p.bloqueado), String(bloquear));
  revalidatePath(`/admin/lojas/${lojaId}`);
  return { ok: true };
}

/* ───────── Situação da Loja ───────── */
export async function alterarBloqueioLoja(lojaId: string, bloquear: boolean, motivo: string): Promise<Resultado> {
  await exigirPerfil('admin');
  if (bloquear && motivo.trim().length < 3) return { ok: false, erro: 'Informe o motivo do bloqueio.', campos: { motivo: 'Informe o motivo.' } };
  const supabase = await createClient();
  const { error } = await supabase.from('lojas').update(bloquear
    ? { bloqueada: true, bloqueio_automatico: false, bloqueada_em: new Date().toISOString(), motivo_bloqueio: motivo.trim() }
    : { bloqueada: false, bloqueio_automatico: false, bloqueada_em: null, motivo_bloqueio: null }).eq('id', lojaId);
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  revalidatePath(`/admin/lojas/${lojaId}`); revalidatePath('/admin');
  return { ok: true };
}

/* ───────── Cobrança (Asaas) ───────── */
export async function ativarCobranca(lojaId: string): Promise<Resultado<{ criadas: number }>> {
  await exigirPerfil('admin');
  if (!asaasConfigurado()) return { ok: false, erro: 'Configure a chave do Asaas (ASAAS_API_KEY) para cobrar pelo Asaas. Enquanto isso, use “Nova fatura manual”.' };
  const admin = createAdminClient();
  const { data: l } = await admin.from('lojas').select('*').eq('id', lojaId).single();
  if (!l) return { ok: false, erro: 'Loja não encontrada.' };
  if (!l.cnpj) return { ok: false, erro: 'Cadastre o CNPJ da Loja antes de cobrar.' };
  let criadas = 0;
  try {
    let cliente = l.asaas_customer_id as string | null;
    if (!cliente) {
      cliente = (await asaas.criarCliente({ name: l.razao_social || l.nome, cpfCnpj: l.cnpj, email: l.email, mobilePhone: l.telefone, externalReference: l.id })).id;
      await admin.from('lojas').update({ asaas_customer_id: cliente }).eq('id', l.id);
    }
    const { count: temStart } = await admin.from('faturas').select('id', { count: 'exact', head: true }).eq('loja_id', l.id).eq('tipo', 'start').neq('status', 'cancelado');
    if (Number(l.taxa_start) > 0 && !temStart) {
      const venc = new Date(Date.now() - 3 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
      const p = await asaas.criarCobranca({ customer: cliente, value: Number(l.taxa_start), dueDate: venc, description: `Start do projeto · Sistema de OS – Auto Visão · ${l.nome}`, externalReference: `start:${l.id}` });
      await admin.from('faturas').upsert({ loja_id: l.id, tipo: 'start', descricao: 'Start do projeto', valor: p.value, vencimento: p.dueDate, status: statusFatura(p.status), asaas_payment_id: p.id, link_pagamento: p.invoiceUrl ?? null }, { onConflict: 'asaas_payment_id' });
      criadas++;
    }
    if (Number(l.plano_mensal) > 0 && !l.asaas_subscription_id) {
      const assin = await asaas.criarAssinatura({ customer: cliente, value: Number(l.plano_mensal), nextDueDate: proximoVencimento(l.dia_vencimento), description: `Mensalidade · Sistema de OS – Auto Visão · ${l.nome}`, externalReference: `mensal:${l.id}` });
      await admin.from('lojas').update({ asaas_subscription_id: assin.id }).eq('id', l.id);
      const { data: pags } = await asaas.pagamentosDaAssinatura(assin.id);
      for (const p of pags ?? []) {
        await admin.from('faturas').upsert({ loja_id: l.id, tipo: 'mensalidade', descricao: `Mensalidade ${p.dueDate.slice(5, 7)}/${p.dueDate.slice(0, 4)}`, valor: p.value, vencimento: p.dueDate, status: statusFatura(p.status), asaas_payment_id: p.id, link_pagamento: p.invoiceUrl ?? null }, { onConflict: 'asaas_payment_id' });
        criadas++;
      }
    }
  } catch (e) {
    return { ok: false, erro: e instanceof ErroAsaas ? e.message : 'Não foi possível falar com o Asaas. Tente de novo.' };
  }
  revalidatePath(`/admin/lojas/${lojaId}`); revalidatePath('/admin/cobranca');
  return { ok: true, dados: { criadas } };
}

const faturaManual = z.object({
  tipo: z.enum(['start', 'mensalidade', 'avulsa']),
  descricao: z.string().trim().min(2, 'Descreva a fatura.'),
  valor: z.coerce.number().positive('Informe o valor.'),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o vencimento.'),
});

export async function criarFaturaManual(lojaId: string, d: z.input<typeof faturaManual>): Promise<Resultado> {
  await exigirPerfil('admin');
  const p = faturaManual.safeParse(d);
  if (!p.success) return { ok: false, erro: 'Confira os campos.', campos: campos(p.error) };
  const supabase = await createClient();
  const { error } = await supabase.from('faturas').insert({ loja_id: lojaId, ...p.data });
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  revalidatePath(`/admin/lojas/${lojaId}`); revalidatePath('/admin/cobranca');
  return { ok: true };
}

export async function darBaixaFatura(faturaId: string): Promise<Resultado> {
  await exigirPerfil('admin');
  const admin = createAdminClient();
  const { data: f } = await admin.from('faturas').select('*').eq('id', faturaId).single();
  if (!f) return { ok: false, erro: 'Fatura não encontrada.' };
  if (f.status === 'pago') return { ok: true };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (f.asaas_payment_id && asaasConfigurado()) {
    try { await asaas.receberEmDinheiro(f.asaas_payment_id, Number(f.valor), hoje); } catch (e) { return { ok: false, erro: e instanceof ErroAsaas ? e.message : 'Falha no Asaas.' }; }
  }
  await admin.from('faturas').update({ status: 'pago', pago_em: new Date().toISOString(), forma_pagamento: f.forma_pagamento ?? 'Baixa manual' }).eq('id', faturaId);
  await admin.rpc('reavaliar_bloqueio', { p_loja: f.loja_id });
  revalidatePath(`/admin/lojas/${f.loja_id}`); revalidatePath('/admin/cobranca'); revalidatePath('/admin');
  return { ok: true };
}
