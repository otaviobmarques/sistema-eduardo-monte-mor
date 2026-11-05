import 'server-only';

import { createAdminClient } from './supabase/admin';

/**
 * Cliente mínimo da API do Asaas (v3). As credenciais são configuradas pelo Administrador em
 * /admin/gateways e ficam criptografadas no Supabase Vault. Variáveis de ambiente (ASAAS_API_KEY,
 * ASAAS_AMBIENTE, ASAAS_WEBHOOK_TOKEN) valem só como alternativa quando o painel não tiver chave.
 */
const BASE = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' } as const;

export interface CredenciaisAsaas { ativo: boolean; ambiente: 'sandbox' | 'producao'; chave: string | null; webhookToken: string | null }

export async function credenciaisAsaas(): Promise<CredenciaisAsaas> {
  const { data } = await createAdminClient().rpc('credenciais_gateway', { p_provedor: 'asaas' });
  const c = (data as { ativo: boolean; ambiente: string; chave: string | null; webhook_token: string | null }[] | null)?.[0];
  if (c?.chave) return { ativo: c.ativo, ambiente: c.ambiente === 'producao' ? 'producao' : 'sandbox', chave: c.chave, webhookToken: c.webhook_token };
  return {
    ativo: !!process.env.ASAAS_API_KEY, ambiente: process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox',
    chave: process.env.ASAAS_API_KEY ?? null, webhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? c?.webhook_token ?? null,
  };
}

export const asaasConfigurado = async () => { const c = await credenciaisAsaas(); return c.ativo && !!c.chave; };
export const ambienteAsaas = async () => (await credenciaisAsaas()).ambiente;

export class ErroAsaas extends Error {}

async function chamar<T>(metodo: 'GET' | 'POST' | 'PUT' | 'DELETE', caminho: string, corpo?: unknown, cred?: CredenciaisAsaas): Promise<T> {
  const c = cred ?? (await credenciaisAsaas());
  if (!c.chave) throw new ErroAsaas('Asaas não configurado. Informe a chave em Gateways de pagamento.');
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

export const asaas = {
  criarCliente: (d: { name: string; cpfCnpj: string; email?: string | null; mobilePhone?: string | null; externalReference: string }) =>
    chamar<{ id: string }>('POST', '/customers', { ...d, notificationDisabled: false }),
  criarCobranca: (d: { customer: string; value: number; dueDate: string; description: string; externalReference: string }) =>
    chamar<PagamentoAsaas>('POST', '/payments', { ...d, billingType: 'UNDEFINED' }),
  criarAssinatura: (d: { customer: string; value: number; nextDueDate: string; description: string; externalReference: string }) =>
    chamar<{ id: string }>('POST', '/subscriptions', { ...d, billingType: 'UNDEFINED', cycle: 'MONTHLY' }),
  pagamentosDaAssinatura: (id: string) => chamar<{ data: PagamentoAsaas[] }>('GET', `/subscriptions/${id}/payments`),
  cancelarAssinatura: (id: string) => chamar<{ deleted: boolean }>('DELETE', `/subscriptions/${id}`),
  receberEmDinheiro: (id: string, valor: number, data: string) => chamar<PagamentoAsaas>('POST', `/payments/${id}/receiveInCash`, { paymentDate: data, value: valor, notifyCustomer: false }),
  /** Teste de conexão com uma credencial ainda não salva (ou a salva). */
  testar: (cred: CredenciaisAsaas) => chamar<{ totalCount: number }>('GET', '/customers?limit=1', undefined, cred),
  listarWebhooks: () => chamar<{ data: { id: string; url: string }[] }>('GET', '/webhooks'),
  criarWebhook: (d: { url: string; email: string; authToken: string }) => chamar<{ id: string }>('POST', '/webhooks', {
    name: 'Sistema de OS – Auto Visão', url: d.url, email: d.email, enabled: true, interrupted: false, apiVersion: 3,
    authToken: d.authToken, sendType: 'SEQUENTIALLY',
    events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE'],
  }),
  atualizarWebhook: (id: string, d: { url: string; email: string; authToken: string }) => chamar<{ id: string }>('PUT', `/webhooks/${id}`, {
    url: d.url, email: d.email, enabled: true, interrupted: false, authToken: d.authToken,
  }),
};

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
