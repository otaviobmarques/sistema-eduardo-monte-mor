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

/** Aceita "1.234,56", "R$ 150", "150.5". Retorna null se vazio/inválido. */
export function parseMoeda(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = (v ?? '').replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function valorParaCampo(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  return Number(v).toFixed(2).replace('.', ',');
}

export function telefone(v: string | null | undefined): string {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return v ?? '';
}

/** Primeira palavra do nome, sem acentos e minúscula (ex.: "Creditas S.A." → "creditas"). */
export function sugerirLogin(nome: string): string {
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
  const palavras = limpo.split(/\s+/).filter(Boolean);
  if (!palavras.length) return '';
  const primeira = palavras[0];
  return (primeira.length >= 4 ? primeira : palavras.slice(0, 2).join('')).slice(0, 30);
}

export const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
