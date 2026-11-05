'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { asaasCom, credenciaisAsaas, ErroAsaas, FORMAS_ASAAS, formaValida, NOME_AMBIENTE, type FormaAsaas, proximoVencimento, statusFatura, type AmbienteAsaas, type CredenciaisAsaas } from '@/lib/asaas';
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
const erroAsaas = (e: unknown, padrao = 'Não foi possível falar com o Asaas. Tente de novo.') => (e instanceof ErroAsaas ? e.message : padrao);

/** Forma de pagamento padrão das cobranças novas (Admin › Gateways › Formas de pagamento). */
async function formaPadrao(): Promise<FormaAsaas> {
  const { data } = await createAdminClient().from('gateways_pagamento').select('forma_pagamento').eq('provedor', 'asaas').maybeSingle();
  return formaValida(data?.forma_pagamento);
}

/** Credenciais do ambiente em uso, se o gateway estiver ligado. */
async function gatewayEmUso(): Promise<CredenciaisAsaas | null> {
  const c = await credenciaisAsaas();
  return c.ativo && c.chave ? c : null;
}

export async function ativarCobranca(lojaId: string): Promise<Resultado<{ criadas: number }>> {
  await exigirPerfil('admin');
  const cred = await gatewayEmUso();
  if (!cred) return { ok: false, erro: 'Ative o Asaas em Gateways de pagamento para cobrar por ele. Enquanto isso, use “Nova fatura” manual.' };
  const api = asaasCom(cred);
  const forma = await formaPadrao();
  const admin = createAdminClient();
  const { data: l } = await admin.from('lojas').select('*').eq('id', lojaId).single();
  if (!l) return { ok: false, erro: 'Loja não encontrada.' };
  if (!l.cnpj) return { ok: false, erro: 'Cadastre o CNPJ da Loja antes de cobrar.' };
  let criadas = 0;
  try {
    const { customer, subscription } = await garantirClienteAsaas(l, cred);
    const { count: temStart } = await admin.from('faturas').select('id', { count: 'exact', head: true }).eq('loja_id', l.id).eq('tipo', 'start').eq('ambiente', cred.ambiente).neq('status', 'cancelado');
    if (Number(l.taxa_start) > 0 && !temStart) {
      const venc = new Date(Date.now() - 3 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
      const p = await api.criarCobranca({ customer, value: Number(l.taxa_start), dueDate: venc, description: `Start do projeto · Sistema de OS – Auto Visão · ${l.nome}`, externalReference: `start:${l.id}`, billingType: forma });
      await admin.from('faturas').upsert({ loja_id: l.id, tipo: 'start', descricao: 'Start do projeto', valor: p.value, vencimento: p.dueDate, status: statusFatura(p.status), asaas_payment_id: p.id, link_pagamento: p.invoiceUrl ?? null, ambiente: cred.ambiente, forma_solicitada: forma }, { onConflict: 'asaas_payment_id' });
      criadas++;
    }
    if (Number(l.plano_mensal) > 0 && !subscription) {
      const assin = await api.criarAssinatura({ customer, value: Number(l.plano_mensal), nextDueDate: proximoVencimento(l.dia_vencimento), description: `Mensalidade · Sistema de OS – Auto Visão · ${l.nome}`, externalReference: `mensal:${l.id}`, billingType: forma });
      await admin.from('lojas_gateway').update({ subscription_id: assin.id }).eq('loja_id', l.id).eq('provedor', 'asaas').eq('ambiente', cred.ambiente);
      const { data: pags } = await api.pagamentosDaAssinatura(assin.id);
      for (const p of pags ?? []) {
        await admin.from('faturas').upsert({ loja_id: l.id, tipo: 'mensalidade', descricao: `Mensalidade ${p.dueDate.slice(5, 7)}/${p.dueDate.slice(0, 4)}`, valor: p.value, vencimento: p.dueDate, status: statusFatura(p.status), asaas_payment_id: p.id, link_pagamento: p.invoiceUrl ?? null, ambiente: cred.ambiente, forma_solicitada: forma }, { onConflict: 'asaas_payment_id' });
        criadas++;
      }
    }
  } catch (e) {
    return { ok: false, erro: erroAsaas(e) };
  }
  revalidatePath(`/admin/lojas/${lojaId}`); revalidatePath('/admin/cobranca');
  return { ok: true, dados: { criadas } };
}

export async function darBaixaFatura(faturaId: string): Promise<Resultado> {
  await exigirPerfil('admin');
  const admin = createAdminClient();
  const { data: f } = await admin.from('faturas').select('*').eq('id', faturaId).single();
  if (!f) return { ok: false, erro: 'Fatura não encontrada.' };
  if (f.status === 'pago') return { ok: true };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (f.asaas_payment_id && f.ambiente) {
    // A baixa vai para a conta Asaas onde a fatura nasceu, mesmo que o ambiente em uso seja outro
    const cred = await credenciaisAsaas(f.ambiente as AmbienteAsaas);
    if (!cred.chave) return { ok: false, erro: `Esta fatura é do Asaas ${NOME_AMBIENTE[f.ambiente as AmbienteAsaas]}, que está sem chave. Cadastre a chave desse ambiente para dar baixa.` };
    try { await asaasCom(cred).receberEmDinheiro(f.asaas_payment_id, Number(f.valor), hoje); } catch (e) { return { ok: false, erro: erroAsaas(e, 'Falha no Asaas.') }; }
  }
  await admin.from('faturas').update({ status: 'pago', pago_em: new Date().toISOString(), forma_pagamento: f.forma_pagamento ?? 'Baixa manual' }).eq('id', faturaId);
  await admin.rpc('reavaliar_bloqueio', { p_loja: f.loja_id });
  revalidatePath(`/admin/lojas/${f.loja_id}`); revalidatePath('/admin/cobranca'); revalidatePath('/admin');
  return { ok: true };
}

/* ───────── Cliente da Loja no Asaas (um por ambiente) ───────── */
type LojaAsaas = { id: string; nome: string; razao_social: string | null; cnpj: string | null; email: string | null; telefone: string | null };
async function garantirClienteAsaas(l: LojaAsaas, cred: CredenciaisAsaas): Promise<{ customer: string; subscription: string | null }> {
  const admin = createAdminClient();
  const { data: g } = await admin.from('lojas_gateway').select('customer_id, subscription_id').eq('loja_id', l.id).eq('provedor', 'asaas').eq('ambiente', cred.ambiente).maybeSingle();
  if (g?.customer_id) return { customer: g.customer_id, subscription: g.subscription_id };
  if (!l.cnpj) throw new ErroAsaas('Cadastre o CNPJ da Loja antes de cobrar pelo Asaas.');
  const id = (await asaasCom(cred).criarCliente({ name: l.razao_social || l.nome, cpfCnpj: l.cnpj, email: l.email, mobilePhone: l.telefone, externalReference: l.id })).id;
  await admin.from('lojas_gateway').upsert({ loja_id: l.id, provedor: 'asaas', ambiente: cred.ambiente, customer_id: id }, { onConflict: 'loja_id,provedor,ambiente' });
  return { customer: id, subscription: null };
}

/* ───────── Nova fatura para uma Loja (pelo gateway ou manual) ───────── */
const novaFatura = z.object({
  loja_id: z.string().uuid('Escolha a Loja.'),
  tipo: z.enum(['start', 'mensalidade', 'avulsa']),
  descricao: z.string().trim().min(2, 'Descreva a fatura (ex.: Mensalidade 11/2026).'),
  valor: z.coerce.number({ invalid_type_error: 'Informe o valor.' }).positive('Informe um valor maior que zero.'),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o vencimento.'),
  via_gateway: z.coerce.boolean(),
  forma: z.enum(['UNDEFINED', 'PIX', 'BOLETO', 'CREDIT_CARD']).optional(),
});
export type NovaFaturaDados = z.input<typeof novaFatura>;

export async function criarFatura(d: NovaFaturaDados): Promise<Resultado<{ link: string | null; ambiente: AmbienteAsaas | null }>> {
  await exigirPerfil('admin');
  const p = novaFatura.safeParse(d);
  if (!p.success) return { ok: false, erro: 'Confira os campos.', campos: campos(p.error) };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (p.data.via_gateway && p.data.vencimento < hoje) return { ok: false, erro: 'Pelo gateway o vencimento precisa ser hoje ou depois.', campos: { vencimento: 'Use hoje ou uma data futura.' } };
  const admin = createAdminClient();
  const { data: l } = await admin.from('lojas').select('id, nome, razao_social, cnpj, email, telefone').eq('id', p.data.loja_id).single();
  if (!l) return { ok: false, erro: 'Loja não encontrada.', campos: { loja_id: 'Loja não encontrada.' } };
  const base = { loja_id: l.id, tipo: p.data.tipo, descricao: p.data.descricao, valor: p.data.valor, vencimento: p.data.vencimento };
  let link: string | null = null, ambiente: AmbienteAsaas | null = null;
  if (p.data.via_gateway) {
    const cred = await gatewayEmUso();
    if (!cred) return { ok: false, erro: 'Ative o Asaas em Gateways de pagamento ou desmarque “Cobrar pelo Asaas”.' };
    try {
      const { customer } = await garantirClienteAsaas(l, cred);
      const forma = p.data.forma ?? (await formaPadrao());
      const pag = await asaasCom(cred).criarCobranca({ customer, value: p.data.valor, dueDate: p.data.vencimento, description: `${p.data.descricao} · ${l.nome}`, externalReference: `${p.data.tipo === 'mensalidade' ? 'mensal' : p.data.tipo}:${l.id}`, billingType: forma });
      link = pag.invoiceUrl ?? null; ambiente = cred.ambiente;
      const { error } = await admin.from('faturas').upsert({ ...base, status: statusFatura(pag.status), asaas_payment_id: pag.id, link_pagamento: link, ambiente, forma_solicitada: forma }, { onConflict: 'asaas_payment_id' });
      if (error) return { ok: false, erro: mensagemErroBanco(error) };
    } catch (e) {
      return { ok: false, erro: erroAsaas(e, 'Não foi possível falar com o Asaas.') };
    }
  } else {
    const { error } = await admin.from('faturas').insert({ ...base, status: p.data.vencimento < hoje ? 'vencido' : 'pendente' });
    if (error) return { ok: false, erro: mensagemErroBanco(error) };
  }
  revalidatePath(`/admin/lojas/${l.id}`); revalidatePath('/admin/cobranca'); revalidatePath('/admin');
  return { ok: true, dados: { link, ambiente } };
}

/* ───────── Gateways de pagamento (uma configuração por ambiente + seletor) ───────── */
const ambienteValido = (a: string): AmbienteAsaas | null => (a === 'sandbox' || a === 'producao' ? a : null);
const MSG_GW: Record<string, string> = {
  SEM_CHAVE: 'Cadastre e teste a chave deste ambiente antes de usá-lo para cobrar.',
  SEM_PERMISSAO: 'Só o Administrador altera gateways.',
};
const erroGw = (m: string, padrao: string) => MSG_GW[Object.keys(MSG_GW).find((k) => m.includes(k)) ?? ''] ?? padrao;

async function registrarTeste(ambiente: AmbienteAsaas, ok: boolean, mensagem: string, userId: string) {
  const supabase = await createClient();
  await supabase.from('gateways_ambientes').update({ testado_em: new Date().toISOString(), teste_ok: ok, teste_mensagem: mensagem, atualizado_por: userId }).eq('provedor', 'asaas').eq('ambiente', ambiente);
}

/** Salva a chave de um ambiente depois de testá-la nesse ambiente. Chave vazia = testa de novo a chave salva. */
export async function salvarChaveGateway(ambienteBruto: string, chaveBruta: string): Promise<Resultado<{ mensagem: string }>> {
  const s = await exigirPerfil('admin');
  const ambiente = ambienteValido(ambienteBruto);
  if (!ambiente) return { ok: false, erro: 'Ambiente inválido.' };
  const nome = NOME_AMBIENTE[ambiente];
  const chave = chaveBruta.trim();
  if (chave && !/^\$?aact_/.test(chave) && chave.length < 30) return { ok: false, erro: 'Isso não parece uma chave de API do Asaas (começa com $aact_).', campos: { chave: 'Chave inválida.' } };
  const salva = await credenciaisAsaas(ambiente);
  const usar = chave || salva.chave;
  if (!usar) return { ok: false, erro: `Cole a chave de API do Asaas ${nome}.`, campos: { chave: 'Informe a chave.' } };
  try {
    await asaasCom({ ativo: true, ambiente, chave: usar, webhookToken: null }).testar();
  } catch (e) {
    const msg = `${erroAsaas(e, 'Falha ao conectar.')} Confira se a chave é da conta ${ambiente === 'producao' ? 'de produção (asaas.com)' : 'de teste (sandbox.asaas.com)'}.`;
    if (!chave) await registrarTeste(ambiente, false, msg, s.userId);
    return { ok: false, erro: chave ? `${msg} Nada foi salvo.` : msg, campos: { chave: 'Não conectou.' } };
  }
  const supabase = await createClient();
  if (chave) {
    const { error } = await supabase.rpc('salvar_chave_gateway', { p_provedor: 'asaas', p_ambiente: ambiente, p_chave: chave });
    if (error) return { ok: false, erro: erroGw(error.message, 'Não foi possível salvar.') };
  }
  const mensagem = `Conexão com o Asaas ${nome} funcionando.`;
  await registrarTeste(ambiente, true, mensagem, s.userId);
  revalidatePath('/admin/gateways'); revalidatePath('/admin/cobranca');
  return { ok: true, dados: { mensagem } };
}

export async function removerChaveGateway(ambienteBruto: string): Promise<Resultado> {
  await exigirPerfil('admin');
  const ambiente = ambienteValido(ambienteBruto);
  if (!ambiente) return { ok: false, erro: 'Ambiente inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('remover_chave_gateway', { p_provedor: 'asaas', p_ambiente: ambiente });
  if (error) return { ok: false, erro: erroGw(error.message, 'Não foi possível remover.') };
  revalidatePath('/admin/gateways'); revalidatePath('/admin/cobranca');
  return { ok: true };
}

/** Seletor: qual ambiente vale para as cobranças novas, e se o Asaas está ligado. */
export async function usarAmbienteGateway(ambienteBruto: string, ativo: boolean): Promise<Resultado<{ mensagem: string }>> {
  await exigirPerfil('admin');
  const ambiente = ambienteValido(ambienteBruto);
  if (!ambiente) return { ok: false, erro: 'Ambiente inválido.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('usar_ambiente_gateway', { p_provedor: 'asaas', p_ambiente: ambiente, p_ativo: ativo });
  if (error) return { ok: false, erro: erroGw(error.message, 'Não foi possível salvar.') };
  revalidatePath('/admin/gateways'); revalidatePath('/admin/cobranca'); revalidatePath('/admin', 'layout');
  return { ok: true, dados: { mensagem: ativo ? `As cobranças novas saem pelo Asaas ${NOME_AMBIENTE[ambiente]}.` : 'Asaas desligado: as cobranças novas serão manuais.' } };
}

export async function configurarWebhook(ambienteBruto: string, email: string): Promise<Resultado<{ url: string }>> {
  await exigirPerfil('admin');
  const ambiente = ambienteValido(ambienteBruto);
  if (!ambiente) return { ok: false, erro: 'Ambiente inválido.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { ok: false, erro: 'Informe o e-mail que recebe avisos de falha do webhook.', campos: { email: 'E-mail inválido.' } };
  const cred = await credenciaisAsaas(ambiente);
  if (!cred.chave) return { ok: false, erro: `Salve a chave do Asaas ${NOME_AMBIENTE[ambiente]} antes.` };
  if (!cred.webhookToken) return { ok: false, erro: 'Salve a chave deste ambiente antes para gerar o token do webhook.' };
  const h = await headers();
  const host = process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const url = `${host.replace(/\/$/, '')}/api/asaas/webhook`;
  if (/localhost|127\.0\.0\.1/.test(url)) return { ok: false, erro: 'O webhook precisa de um endereço público. Configure pelo sistema publicado (Vercel).' };
  try {
    const api = asaasCom(cred);
    const existentes = await api.listarWebhooks();
    const mesmo = existentes.data?.find((w) => w.url === url);
    const r = mesmo ? await api.atualizarWebhook(mesmo.id, { url, email: email.trim(), authToken: cred.webhookToken }) : await api.criarWebhook({ url, email: email.trim(), authToken: cred.webhookToken });
    const supabase = await createClient();
    await supabase.from('gateways_ambientes').update({ webhook_id: r.id ?? mesmo?.id, webhook_url: url }).eq('provedor', 'asaas').eq('ambiente', ambiente);
  } catch (e) {
    return { ok: false, erro: erroAsaas(e, 'Não foi possível configurar o webhook.') };
  }
  revalidatePath('/admin/gateways');
  return { ok: true, dados: { url } };
}

/** Forma de pagamento padrão das cobranças novas; opcionalmente aplica às assinaturas e cobranças em aberto. */
export async function salvarFormaPagamento(formaBruta: string, aplicarExistentes: boolean): Promise<Resultado<{ mensagem: string }>> {
  await exigirPerfil('admin');
  if (!(formaBruta in FORMAS_ASAAS)) return { ok: false, erro: 'Escolha uma forma de pagamento.' };
  const forma = formaBruta as FormaAsaas;
  const supabase = await createClient();
  const { error } = await supabase.from('gateways_pagamento').update({ forma_pagamento: forma }).eq('provedor', 'asaas');
  if (error) return { ok: false, erro: 'Não foi possível salvar.' };
  let mensagem = `Cobranças novas: ${FORMAS_ASAAS[forma].titulo.toLowerCase()}.`;
  if (aplicarExistentes) {
    // Cada assinatura/cobrança é alterada na conta Asaas onde nasceu (Teste ou Produção)
    const admin = createAdminClient();
    let assin = 0, cob = 0; const falhas: string[] = [];
    for (const amb of ['sandbox', 'producao'] as const) {
      const cred = await credenciaisAsaas(amb);
      if (!cred.chave) continue;
      const api = asaasCom(cred);
      const { data: subs } = await admin.from('lojas_gateway').select('subscription_id').eq('provedor', 'asaas').eq('ambiente', amb).not('subscription_id', 'is', null);
      for (const sub of subs ?? []) { try { await api.alterarFormaAssinatura(sub.subscription_id!, forma); assin++; } catch (e) { falhas.push(erroAsaas(e)); } }
      const { data: fs } = await admin.from('faturas').select('id, asaas_payment_id').eq('ambiente', amb).in('status', ['pendente', 'vencido']).not('asaas_payment_id', 'is', null);
      for (const f of fs ?? []) {
        try { await api.alterarFormaCobranca(f.asaas_payment_id!, forma); await admin.from('faturas').update({ forma_solicitada: forma }).eq('id', f.id); cob++; } catch (e) { falhas.push(erroAsaas(e)); }
      }
    }
    mensagem += ` Atualizadas no Asaas: ${assin} assinatura(s) e ${cob} cobrança(s) em aberto.`;
    if (falhas.length) return { ok: false, erro: `${mensagem} ${falhas.length} não puderam ser alteradas: ${[...new Set(falhas)].slice(0, 2).join(' ')}` };
  }
  revalidatePath('/admin/gateways'); revalidatePath('/admin/cobranca');
  return { ok: true, dados: { mensagem } };
}
