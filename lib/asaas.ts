import 'server-only';

import { createAdminClient } from './supabase/admin';

/**
 * Cliente mínimo da API do Asaas (v3). As credenciais são configuradas pelo Administrador em
 * /admin/gateways e ficam criptografadas no Supabase Vault. Variáveis de ambiente (ASAAS_API_KEY,
 * ASAAS_AMBIENTE, ASAAS_WEBHOOK_TOKEN) valem só como alternativa quando o painel não tiver chave.
 */
const BASE = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' } as const;

export type AmbienteAsaas = 'sandbox' | 'producao';
import { FORMAS_ASAAS, formaValida, type FormaAsaas } from './asaas-formas';
export { FORMAS_ASAAS, formaValida, type FormaAsaas };
export const NOME_AMBIENTE: Record<AmbienteAsaas, string> = { sandbox: 'Teste', producao: 'Produção' };
export interface CredenciaisAsaas { ativo: boolean; ambiente: AmbienteAsaas; chave: string | null; webhookToken: string | null }
const amb = (v: unknown): AmbienteAsaas => (v === 'producao' ? 'producao' : 'sandbox');

/**
 * Credenciais do Asaas. Sem argumento: o ambiente em uso (o seletor de /admin/gateways), usado para criar cobranças.
 * Com o ambiente: as credenciais daquele ambiente (testar, configurar webhook, dar baixa numa fatura dele).
 */
export async function credenciaisAsaas(ambiente?: AmbienteAsaas): Promise<CredenciaisAsaas> {
  const admin = createAdminClient();
  if (ambiente) {
    const { data } = await admin.rpc('credenciais_gateway_ambiente', { p_provedor: 'asaas', p_ambiente: ambiente });
    const c = (data as { chave: string | null; webhook_token: string | null }[] | null)?.[0];
    const doEnv = !c?.chave && process.env.ASAAS_API_KEY && amb(process.env.ASAAS_AMBIENTE) === ambiente;
    return { ativo: !!(c?.chave || doEnv), ambiente, chave: c?.chave ?? (doEnv ? process.env.ASAAS_API_KEY! : null), webhookToken: c?.webhook_token ?? (doEnv ? process.env.ASAAS_WEBHOOK_TOKEN ?? null : null) };
  }
  const { data } = await admin.rpc('credenciais_gateway', { p_provedor: 'asaas' });
  const c = (data as { ativo: boolean; ambiente: string; chave: string | null; webhook_token: string | null }[] | null)?.[0];
  if (c?.chave) return { ativo: c.ativo, ambiente: amb(c.ambiente), chave: c.chave, webhookToken: c.webhook_token };
  // Alternativa: variáveis de ambiente do servidor, quando o painel não tem chave
  return {
    ativo: !!process.env.ASAAS_API_KEY, ambiente: process.env.ASAAS_API_KEY ? amb(process.env.ASAAS_AMBIENTE) : amb(c?.ambiente),
    chave: process.env.ASAAS_API_KEY ?? null, webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? null,
  };
}

export const asaasConfigurado = async () => { const c = await credenciaisAsaas(); return c.ativo && !!c.chave; };
export const ambienteAsaas = async () => (await credenciaisAsaas()).ambiente;

/** De qual conta (ambiente) veio um aviso do webhook, pelo token recebido. */
export async function ambienteDoToken(token: string, iguais: (a: string, b: string) => boolean): Promise<AmbienteAsaas | null> {
  const { data } = await createAdminClient().rpc('tokens_webhook_gateway', { p_provedor: 'asaas' });
  for (const t of (data as { ambiente: string; webhook_token: string | null }[] | null) ?? []) if (t.webhook_token && iguais(token, t.webhook_token)) return amb(t.ambiente);
  if (process.env.ASAAS_WEBHOOK_TOKEN && iguais(token, process.env.ASAAS_WEBHOOK_TOKEN)) return amb(process.env.ASAAS_AMBIENTE);
  return null;
}

export class ErroAsaas extends Error {}

async function chamar<T>(c: CredenciaisAsaas, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
  if (!c.chave) throw new ErroAsaas(`Asaas (${NOME_AMBIENTE[c.ambiente]}) sem chave. Informe a chave em Gateways de pagamento.`);
  const r = await fetch(`${process.env.ASAAS_URL ?? BASE[c.ambiente]}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', access_token: c.chave, 'User-Agent': 'SistemaOS-AutoVisao/1.0' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (json as { errors?: { description: string }[] }).errors?.map((e) => e.description).join(' ')
      || (r.status === 401 ? 'chave de API inválida para este ambiente.' : `HTTP ${r.status}`);
    throw new ErroAsaas(`Asaas: ${msg}`);
  }
  return json as T;
}

export interface PagamentoAsaas {
  id: string; customer: string; subscription?: string | null; value: number; dueDate: string; status: string;
  invoiceUrl?: string; billingType?: string; paymentDate?: string | null; clientPaymentDate?: string | null;
  externalReference?: string | null; description?: string | null; deleted?: boolean;
}

/** Cliente da API ligado a uma credencial (um ambiente). */
export function asaasCom(c: CredenciaisAsaas) {
  return {
    ambiente: c.ambiente,
    criarCliente: (d: { name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string }) =>
      chamar<{ id: string }>(c, 'POST', '/customers', { ...d, notificationDisabled: false }),
    criarCobranca: (d: { customer: string; value: number; dueDate: string; description: string; externalReference: string; billingType?: FormaAsaas }) =>
      chamar<PagamentoAsaas>(c, 'POST', '/payments', { ...d, billingType: d.billingType ?? 'UNDEFINED' }),
    criarAssinatura: (d: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string; billingType?: FormaAsaas }) =>
      chamar<{ id: string }>(c, 'POST', '/subscriptions', { ...d, billingType: d.billingType ?? 'UNDEFINED', cycle: 'MONTHLY' }),
    /** Troca a forma de pagamento de uma assinatura (e das mensalidades dela ainda em aberto). */
    alterarFormaAssinatura: (id: string, billingType: FormaAsaas) => chamar<{ id: string }>(c, 'PUT', `/subscriptions/${id}`, { billingType, updatePendingPayments: true }),
    /** Troca a forma de pagamento de uma cobrança em aberto. */
    alterarFormaCobranca: (id: string, billingType: FormaAsaas) => chamar<PagamentoAsaas>(c, 'PUT', `/payments/${id}`, { billingType }),
    pagamentosDaAssinatura: (id: string) => chamar<{ data: PagamentoAsaas[] }>(c, 'GET', `/subscriptions/${id}/payments`),
    cancelarAssinatura: (id: string) => chamar<{ deleted: boolean }>(c, 'DELETE', `/subscriptions/${id}`),
    receberEmDinheiro: (id: string, valor: number, data: string) => chamar<PagamentoAsaas>(c, 'POST', `/payments/${id}/receiveInCash`, { paymentDate: data, value: valor, notifyCustomer: false }),
    /** Teste de conexão. */
    testar: () => chamar<{ totalCount: number }>(c, 'GET', '/customers?limit=1'),
    listarWebhooks: () => chamar<{ data: { id: string; url: string }[] }>(c, 'GET', '/webhooks'),
    criarWebhook: (d: { url: string; email: string; authToken: string }) => chamar<{ id: string }>(c, 'POST', '/webhooks', {
      name: 'Sistema de OS – Auto Visão', url: d.url, email: d.email, enabled: true, interrupted: false, apiVersion: 3,
      authToken: d.authToken, sendType: 'SEQUENTIALLY',
      events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE'],
    }),
    atualizarWebhook: (id: string, d: { url: string; email: string; authToken: string }) => chamar<{ id: string }>(c, 'PUT', `/webhooks/${id}`, {
      url: d.url, email: d.email, enabled: true, interrupted: false, authToken: d.authToken,
    }),
  };
}

/** Status do Asaas → status da fatura no sistema. */
export function statusFatura(s: string, removida?: boolean): 'pendente' | 'pago' | 'vencido' | 'cancelado' {
  if (removida) return 'cancelado';
  if (['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED'].includes(s)) return 'pago';
  if (['OVERDUE', 'DUNNING_REQUESTED'].includes(s)) return 'vencido';
  if (['REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(s)) return 'cancelado';
  return 'pendente';
}

/** Próxima data com o dia de vencimento da Loja (a partir de amanhã). */
export function proximoVencimento(dia: number, hoje = new Date()): string {
  const br = new Date(hoje.getTime() - 3 * 3600_000);
  let ano = br.getUTCFullYear(), mes = br.getUTCMonth();
  if (br.getUTCDate() >= dia) mes += 1;
  if (mes > 11) { mes = 0; ano += 1; }
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
