/** Regras puras do financeiro: valor da OS, mês de referência e totais do fechamento. */

export type StatusPagamento = 'pendente' | 'pago' | 'faturado';

export const FORMAS_PAGAMENTO = {
  pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', cartao: 'Cartão', dinheiro: 'Dinheiro', faturamento: 'Faturamento mensal',
} as const;
export type FormaPagamento = keyof typeof FORMAS_PAGAMENTO;

export function rotuloForma(f: string | null | undefined): string {
  if (!f) return '—';
  return FORMAS_PAGAMENTO[f as FormaPagamento] ?? f;
}

/** Valor da OS: o final (congelado no laudo) ou o previsto (base + deslocamento + ajuste). */
export function valorDaOs(o: { valor_final: number | string | null; valor_base?: number | string | null; valor_deslocamento?: number | string | null; valor_ajuste?: number | string | null }): number {
  if (o.valor_final !== null && o.valor_final !== undefined) return Number(o.valor_final);
  return Number(o.valor_base ?? 0) + Number(o.valor_deslocamento ?? 0) + Number(o.valor_ajuste ?? 0);
}

/** "2026-11" válido, senão o mês atual em Brasília. */
export function mesReferencia(mes: string | null | undefined, agora = new Date()): string {
  if (mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return mes;
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 7);
}

/** Início e fim (exclusivo) do mês em Brasília (UTC−3, sem horário de verão desde 2019), em ISO UTC. */
export function limitesDoMes(mes: string): { inicio: string; fim: string } {
  const [a, m] = mes.split('-').map(Number);
  const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return { inicio: new Date(`${mes}-01T00:00:00-03:00`).toISOString(), fim: new Date(`${prox}-01T00:00:00-03:00`).toISOString() };
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
export function mesSeguinte(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

export interface TotaisPagamento { qtd: number; total: number; pago: number; pendente: number; faturado: number; qtdPendente: number; qtdPago: number; qtdFaturado: number }

/** Soma por situação. Valores em centavos para não acumular erro de ponto flutuante. */
export function totalizar(linhas: { valor: number; pagamento_status: StatusPagamento }[]): TotaisPagamento {
  const c = { total: 0, pago: 0, pendente: 0, faturado: 0 };
  const q = { pago: 0, pendente: 0, faturado: 0 };
  for (const l of linhas) {
    const v = Math.round(l.valor * 100);
    c.total += v; c[l.pagamento_status] += v; q[l.pagamento_status]++;
  }
  return {
    qtd: linhas.length, total: c.total / 100, pago: c.pago / 100, pendente: c.pendente / 100, faturado: c.faturado / 100,
    qtdPendente: q.pendente, qtdPago: q.pago, qtdFaturado: q.faturado,
  };
}
