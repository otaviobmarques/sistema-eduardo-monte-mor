import { z } from 'zod';
import { UFS } from './formato';

const texto = (min = 1, rot = 'Campo') => z.string().trim().min(min, `${rot}: preencha este campo.`);
const opcional = z.string().trim().optional().transform((v) => (v ? v : null));
const uf = z.string().trim().toUpperCase().refine((v) => UFS.includes(v), 'Selecione a UF.');
const moeda = z.coerce.number({ invalid_type_error: 'Informe um valor em reais, ex.: 150,00.' }).min(0, 'O valor não pode ser negativo.');
const booleano = z.coerce.boolean();

export const SCHEMAS = {
  patios: z.object({ nome: texto(2, 'Nome'), endereco: opcional, cidade: texto(2, 'Cidade'), uf, ativo: booleano }),
  patio_apelidos: z.object({ patio_id: z.string().uuid('Selecione o pátio.'), apelido: texto(2, 'Apelido') }),
  servicos: z.object({
    nome: texto(2, 'Nome'),
    sla_horas: z.coerce.number().int('Use horas inteiras.').min(1, 'Mínimo de 1 hora.').max(48, 'O SLA nunca passa de 48 horas.'),
    padrao: booleano, ativo: booleano,
  }),
  taxas_deslocamento: z.object({ cidade: texto(2, 'Cidade'), uf, valor: moeda }),
  vistoriadores: z.object({
    nome: texto(2, 'Nome'), ativo: booleano,
    telefone: z.string().optional().transform((v) => (v ? v.replace(/\D/g, '') || null : null))
      .refine((v) => !v || v.length === 10 || v.length === 11, 'Informe o celular com DDD (ex.: 19 99999-9999).'),
  }),
  motivos: z.object({
    tipo: z.enum(['frustracao', 'cancelamento', 'atraso', 'pendencia', 'reagendamento'], { errorMap: () => ({ message: 'Selecione o tipo.' }) }),
    descricao: texto(2, 'Descrição'), ordem: z.coerce.number().int().min(0).default(0), ativo: booleano,
  }),
  feriados: z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'), descricao: texto(2, 'Descrição') }),
} as const;

export type TabelaCadastro = keyof typeof SCHEMAS;

export const ROTA_CADASTRO: Record<TabelaCadastro, string> = {
  patios: '/loja/cadastros/patios',
  patio_apelidos: '/loja/cadastros/patios',
  servicos: '/loja/cadastros/servicos',
  taxas_deslocamento: '/loja/cadastros/taxas',
  vistoriadores: '/loja/cadastros/vistoriadores',
  motivos: '/loja/cadastros/motivos',
  feriados: '/loja/configuracoes',
};

/** Tabelas em que excluir é permitido (as demais só desativam, para manter o histórico). */
export const EXCLUIVEL: TabelaCadastro[] = ['patio_apelidos', 'taxas_deslocamento', 'feriados'];

export const MOTIVO_TIPO_LABEL = {
  frustracao: 'Frustração', cancelamento: 'Cancelamento', atraso: 'Atraso', pendencia: 'Pendência', reagendamento: 'Reagendamento',
} as const;

export function mensagemErroBanco(e: { code?: string; message?: string } | null): string {
  if (!e) return 'Não foi possível salvar. Tente de novo.';
  if (e.code === '23505') return 'Já existe um registro com esse valor. Use outro nome.';
  if (e.code === '23503') return 'Este registro está em uso e não pode ser excluído. Desative-o.';
  if (e.code === '23514') return 'Algum valor está fora do permitido. Confira os campos.';
  if (e.code === '42501') return 'Você não tem permissão para esta ação.';
  return 'Não foi possível salvar. Tente de novo.';
}

export type Resultado<T = undefined> = { ok: true; dados?: T } | { ok: false; erro: string; campos?: Record<string, string> };
