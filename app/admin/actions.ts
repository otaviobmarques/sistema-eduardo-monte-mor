'use server';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { asaas, asaasConfigurado, credenciaisAsaas, ErroAsaas, proximoVencimento, statusFatura } from '@/lib/asaas';
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
  if (!(await asaasConfigurado())) return { ok: false, erro: 'Ative o Asaas em Gateways de pagamento para cobrar por ele. Enquanto isso, use “Nova fatura” manual.' };
  const admin = createAdminClient();
  const { data: l } = await admin.from('lojas').select('*').eq('id', lojaId).single();
  if (!l) return { ok: false, erro: 'Loja não encontrada.' };
  if (!l.cnpj) return { ok: false, erro: 'Cadastre o CNPJ da Loja antes de cobrar.' };
  let criadas = 0;
  try {
    const cliente = await garantirClienteAsaas(l);
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

export async function darBaixaFatura(faturaId: string): Promise<Resultado> {
  await exigirPerfil('admin');
  const admin = createAdminClient();
  const { data: f } = await admin.from('faturas').select('*').eq('id', faturaId).single();
  if (!f) return { ok: false, erro: 'Fatura não encontrada.' };
  if (f.status === 'pago') return { ok: true };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (f.asaas_payment_id && (await asaasConfigurado())) {
    try { await asaas.receberEmDinheiro(f.asaas_payment_id, Number(f.valor), hoje); } catch (e) { return { ok: false, erro: e instanceof ErroAsaas ? e.message : 'Falha no Asaas.' }; }
  }
  await admin.from('faturas').update({ status: 'pago', pago_em: new Date().toISOString(), forma_pagamento: f.forma_pagamento ?? 'Baixa manual' }).eq('id', faturaId);
  await admin.rpc('reavaliar_bloqueio', { p_loja: f.loja_id });
  revalidatePath(`/admin/lojas/${f.loja_id}`); revalidatePath('/admin/cobranca'); revalidatePath('/admin');
  return { ok: true };
}

/* ───────── Cliente da Loja no Asaas ───────── */
type LojaAsaas = { id: string; nome: string; razao_social: string | null; cnpj: string | null; email: string | null; telefone: string | null; asaas_customer_id: string | null };
async function garantirClienteAsaas(l: LojaAsaas): Promise<string> {
  if (l.asaas_customer_id) return l.asaas_customer_id;
  if (!l.cnpj) throw new ErroAsaas('Cadastre o CNPJ da Loja antes de cobrar pelo Asaas.');
  const id = (await asaas.criarCliente({ name: l.razao_social || l.nome, cpfCnpj: l.cnpj, email: l.email, mobilePhone: l.telefone, externalReference: l.id })).id;
  await createAdminClient().from('lojas').update({ asaas_customer_id: id }).eq('id', l.id);
  return id;
}

/* ───────── Nova fatura para uma Loja (pelo gateway ou manual) ───────── */
const novaFatura = z.object({
  loja_id: z.string().uuid('Escolha a Loja.'),
  tipo: z.enum(['start', 'mensalidade', 'avulsa']),
  descricao: z.string().trim().min(2, 'Descreva a fatura (ex.: Mensalidade 11/2026).'),
  valor: z.coerce.number({ invalid_type_error: 'Informe o valor.' }).positive('Informe um valor maior que zero.'),
  vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe o vencimento.'),
  via_gateway: z.coerce.boolean(),
});
export type NovaFaturaDados = z.input<typeof novaFatura>;

export async function criarFatura(d: NovaFaturaDados): Promise<Resultado<{ link: string | null }>> {
  await exigirPerfil('admin');
  const p = novaFatura.safeParse(d);
  if (!p.success) return { ok: false, erro: 'Confira os campos.', campos: campos(p.error) };
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if (p.data.via_gateway && p.data.vencimento < hoje) return { ok: false, erro: 'Pelo gateway o vencimento precisa ser hoje ou depois.', campos: { vencimento: 'Use hoje ou uma data futura.' } };
  const admin = createAdminClient();
  const { data: l } = await admin.from('lojas').select('id, nome, razao_social, cnpj, email, telefone, asaas_customer_id').eq('id', p.data.loja_id).single();
  if (!l) return { ok: false, erro: 'Loja não encontrada.', campos: { loja_id: 'Loja não encontrada.' } };
  const base = { loja_id: l.id, tipo: p.data.tipo, descricao: p.data.descricao, valor: p.data.valor, vencimento: p.data.vencimento };
  let link: string | null = null;
  if (p.data.via_gateway) {
    if (!(await asaasConfigurado())) return { ok: false, erro: 'Ative o Asaas em Gateways de pagamento ou desmarque “Cobrar pelo Asaas”.' };
    try {
      const cliente = await garantirClienteAsaas(l);
      const pag = await asaas.criarCobranca({ customer: cliente, value: p.data.valor, dueDate: p.data.vencimento, description: `${p.data.descricao} · ${l.nome}`, externalReference: `${p.data.tipo === 'mensalidade' ? 'mensal' : p.data.tipo}:${l.id}` });
      link = pag.invoiceUrl ?? null;
      const { error } = await admin.from('faturas').upsert({ ...base, status: statusFatura(pag.status), asaas_payment_id: pag.id, link_pagamento: link }, { onConflict: 'asaas_payment_id' });
      if (error) return { ok: false, erro: mensagemErroBanco(error) };
    } catch (e) {
      return { ok: false, erro: e instanceof ErroAsaas ? e.message : 'Não foi possível falar com o Asaas.' };
    }
  } else {
    const { error } = await admin.from('faturas').insert({ ...base, status: p.data.vencimento < hoje ? 'vencido' : 'pendente' });
    if (error) return { ok: false, erro: mensagemErroBanco(error) };
  }
  revalidatePath(`/admin/lojas/${l.id}`); revalidatePath('/admin/cobranca'); revalidatePath('/admin');
  return { ok: true, dados: { link } };
}

/* ───────── Gateways de pagamento ───────── */
export async function salvarGateway(provedor: 'asaas', d: { ambiente: string; ativo: boolean; chave: string }): Promise<Resultado<{ mensagem: string }>> {
  const s = await exigirPerfil('admin');
  const ambiente = d.ambiente === 'producao' ? 'producao' : 'sandbox';
  const chave = d.chave.trim();
  if (chave && !/^\$?aact_/.test(chave) && chave.length < 30) return { ok: false, erro: 'Isso não parece uma chave de API do Asaas (começa com $aact_).', campos: { chave: 'Chave inválida.' } };
  const atual = await credenciaisAsaas();
  const usar = chave || atual.chave;
  if (d.ativo && !usar) return { ok: false, erro: 'Informe a chave de API para ativar.', campos: { chave: 'Informe a chave.' } };
  let mensagem = 'Configuração salva.';
  let testeOk: boolean | null = null;
  if (usar) {
    try {
      await asaas.testar({ ativo: true, ambiente, chave: usar, webhookToken: null });
      testeOk = true; mensagem = `Conexão com o Asaas (${ambiente === 'producao' ? 'produção' : 'sandbox'}) funcionando.`;
    } catch (e) {
      return { ok: false, erro: `${e instanceof ErroAsaas ? e.message : 'Falha ao conectar.'} Confira se a chave é do ambiente ${ambiente === 'producao' ? 'de produção' : 'sandbox'}. Nada foi salvo.`, campos: { chave: 'Não conectou.' } };
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('salvar_gateway', { p_provedor: provedor, p_ambiente: ambiente, p_ativo: d.ativo, p_chave: chave || null });
  if (error) return { ok: false, erro: 'Não foi possível salvar.' };
  if (testeOk !== null) await supabase.from('gateways_pagamento').update({ testado_em: new Date().toISOString(), teste_ok: testeOk, teste_mensagem: mensagem, atualizado_por: s.userId }).eq('provedor', provedor);
  revalidatePath('/admin/gateways'); revalidatePath('/admin/cobranca');
  return { ok: true, dados: { mensagem } };
}

export async function configurarWebhook(email: string): Promise<Resultado<{ url: string }>> {
  await exigirPerfil('admin');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return { ok: false, erro: 'Informe o e-mail que recebe avisos de falha do webhook.', campos: { email: 'E-mail inválido.' } };
  const cred = await credenciaisAsaas();
  if (!cred.chave) return { ok: false, erro: 'Salve a chave do Asaas antes.' };
  if (!cred.webhookToken) return { ok: false, erro: 'Salve a configuração do Asaas antes para gerar o token do webhook.' };
  const h = await headers();
  const host = process.env.APP_URL ?? `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('x-forwarded-host') ?? h.get('host')}`;
  const url = `${host.replace(/\/$/, '')}/api/asaas/webhook`;
  if (/localhost|127\.0\.0\.1/.test(url)) return { ok: false, erro: 'O webhook precisa de um endereço público. Configure pelo sistema publicado (Vercel).' };
  try {
    const existentes = await asaas.listarWebhooks();
    const mesmo = existentes.data?.find((w) => w.url === url);
    const r = mesmo ? await asaas.atualizarWebhook(mesmo.id, { url, email: email.trim(), authToken: cred.webhookToken }) : await asaas.criarWebhook({ url, email: email.trim(), authToken: cred.webhookToken });
    const supabase = await createClient();
    await supabase.from('gateways_pagamento').update({ webhook_id: r.id ?? mesmo?.id, webhook_url: url }).eq('provedor', 'asaas');
  } catch (e) {
    return { ok: false, erro: e instanceof ErroAsaas ? e.message : 'Não foi possível configurar o webhook.' };
  }
  revalidatePath('/admin/gateways');
  return { ok: true, dados: { url } };
}
