const TZ = 'America/Sao_Paulo';

export function dataHora(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(d)).replace(',', '');
}

export function data(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const v = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00-03:00`) : new Date(d);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(v);
}

export function hora(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

export function moeda(v: number | string | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));
}

export function cnpj(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v ?? '';
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export const STATUS_LABEL = {
  a_vistoriar: 'A vistoriar',
  frustrado: 'Frustrado',
  vistoriado: 'Vistoriado',
  cancelado: 'Cancelado',
} as const;

export const ETAPA_LABEL = {
  aberta: 'Aberta',
  agendada: 'Agendada',
  em_execucao: 'Em execução',
  laudo_em_elaboracao: 'Laudo em elaboração',
} as const;

export const PAGAMENTO_LABEL = { pendente: 'Pendente', pago: 'Pago', faturado: 'Faturado' } as const;
