import { z } from 'zod';
import { placaValida, normalizarPlaca } from './regras/placa';
import { renavamValido } from './regras/renavam';

/** Validação da Nova OS — usada no formulário (ao vivo) e no servidor. */
export const novaOsSchema = z
  .object({
    empresa_id: z.string().uuid().nullable(),
    nome_solicitante: z.string().trim().min(2, 'Informe o nome de quem está pedindo a vistoria.'),
    telefone: z.string().optional().transform((v) => (v ?? '').replace(/\D/g, ''))
      .refine((v) => !v || v.length === 10 || v.length === 11, 'Informe um telefone com DDD.'),
    placa: z.string().transform(normalizarPlaca).refine(placaValida, 'Placa inválida. Use AAA1234 ou AAA1A23.'),
    renavam: z.string().optional().transform((v) => (v ?? '').replace(/\D/g, ''))
      .refine((v) => !v || renavamValido(v), 'Renavam inválido. Confira os 11 dígitos.'),
    marca_modelo: z.string().trim().min(2, 'Informe a marca e o modelo.'),
    ano: z.string().trim().optional().refine((v) => !v || /^\d{4}(\/\d{4})?$/.test(v), 'Use o formato 2020 ou 2020/2021.'),
    cor: z.string().trim().optional(),
    categoria_id: z.string().uuid('Escolha a categoria do veículo.'),
    servico_id: z.string().uuid('Escolha o serviço.'),
    local_tipo: z.enum(['patio', 'endereco']),
    patio_id: z.string().optional(),
    endereco: z.string().trim().optional(),
    cidade: z.string().trim().optional(),
    uf: z.string().trim().optional(),
    observacao: z.string().trim().max(2000, 'Use até 2000 caracteres.').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.local_tipo === 'patio' && !v.patio_id) ctx.addIssue({ code: 'custom', path: ['patio_id'], message: 'Escolha o pátio.' });
    if (v.local_tipo === 'endereco') {
      if (!v.endereco) ctx.addIssue({ code: 'custom', path: ['endereco'], message: 'Informe o endereço da vistoria.' });
      if (!v.cidade) ctx.addIssue({ code: 'custom', path: ['cidade'], message: 'Informe a cidade.' });
      if (!v.uf) ctx.addIssue({ code: 'custom', path: ['uf'], message: 'Selecione a UF.' });
    }
  });
export type NovaOsEntrada = z.input<typeof novaOsSchema>;

/** Converte os erros levantados por public.abrir_os em mensagens para a pessoa. */
export function mensagemErroAbertura(msg: string | undefined): { texto: string; campo?: string; osExistente?: number } {
  const m = msg ?? '';
  const dup = m.match(/DUPLICADA:(\d+)/);
  if (dup) return { texto: `Esta placa já tem a OS nº ${dup[1]} em aberto. Acompanhe por ela.`, campo: 'placa', osExistente: Number(dup[1]) };
  if (m.includes('PLACA_INVALIDA')) return { texto: 'Placa inválida. Use AAA1234 ou AAA1A23.', campo: 'placa' };
  if (m.includes('RENAVAM_INVALIDO')) return { texto: 'Renavam inválido. Confira os 11 dígitos.', campo: 'renavam' };
  if (m.includes('SOLICITANTE_OBRIGATORIO')) return { texto: 'Informe o nome de quem está pedindo a vistoria.', campo: 'nome_solicitante' };
  if (m.includes('PATIO_INVALIDO')) return { texto: 'Escolha um pátio ativo.', campo: 'patio_id' };
  if (m.includes('SERVICO_INVALIDO')) return { texto: 'Escolha um serviço ativo.', campo: 'servico_id' };
  if (m.includes('ENDERECO_OBRIGATORIO')) return { texto: 'Informe endereço, cidade e UF da vistoria.', campo: 'endereco' };
  if (m.includes('CLIENTE_INATIVO')) return { texto: 'Este cliente está inativo. Fale com a Auto Visão.' };
  if (m.includes('SEM_PERMISSAO')) return { texto: 'Você não tem permissão para abrir OS para este cliente.' };
  return { texto: 'Não foi possível abrir a OS. Tente de novo.' };
}

export const TIPOS_ANEXO_OK = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_ANEXO = 20 * 1024 * 1024;
