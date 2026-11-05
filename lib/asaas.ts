import 'server-only';

/**
 * Cliente mínimo da API do Asaas (v3). Variáveis:
 *  ASAAS_API_KEY        chave de API ($aact_...)
 *  ASAAS_AMBIENTE       "sandbox" (padrão) ou "producao"
 *  ASAAS_WEBHOOK_TOKEN  token configurado no webhook do Asaas (cabeçalho asaas-access-token)
 */
const BASE = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' } as const;

export const asaasConfigurado = () => !!process.env.ASAAS_API_KEY;
export const ambienteAsaas = () => (process.env.ASAAS_AMBIENTE === 'producao' ? 'producao' : 'sandbox');

export class ErroAsaas extends Error {}

async function chamar<T>(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
  const chave = process.env.ASAAS_API_KEY;
  if (!chave) throw new ErroAsaas('Integração com o Asaas não configurada (ASAAS_API_KEY).');
  const r = await fetch(`${process.env.ASAAS_URL ?? BASE[ambienteAsaas()]}${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', access_token: chave, 'User-Agent': 'SistemaOS-AutoVisao/1.0' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (json as { errors?: { description: string }[] }).errors?.map((e) => e.description).join(' ') || `HTTP ${r.status}`;
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
