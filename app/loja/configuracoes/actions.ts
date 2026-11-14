'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { mensagemErroBanco, type Resultado } from '@/lib/cadastros';
import { CORES, STATUS_COM_COR, type CorStatus, type StatusComCor } from '@/lib/cores-status';

const hora = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Use o formato 08:00.');
const schema = z.object({
  alerta1_horas: z.coerce.number().int().min(1, 'Mínimo de 1 hora.').max(47, 'Precisa ser menor que o SLA.'),
  alerta2_horas_antes: z.coerce.number().int().min(1, 'Mínimo de 1 hora.').max(47, 'Precisa ser menor que o SLA.'),
  contagem: z.enum(['corridas', 'uteis']),
  horario_util: z.object({ dias: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha pelo menos um dia.'), inicio: hora, fim: hora })
    .refine((h) => h.inicio < h.fim, { message: 'O fim precisa ser depois do início.', path: ['fim'] }),
  escalonar_minutos: z.coerce.number().int().min(5, 'Mínimo de 5 minutos.').max(1440, 'Máximo de 24 horas.'),
  ajuste_preco_habilitado: z.coerce.boolean(),
  cores_status: z.object(Object.fromEntries(STATUS_COM_COR.map((s) => [s, z.enum(Object.keys(CORES) as [CorStatus, ...CorStatus[]])])) as Record<StatusComCor, z.ZodEnum<[CorStatus, ...CorStatus[]]>>),
});
export type ConfigDados = z.input<typeof schema>;

export async function salvarConfiguracoes(dados: ConfigDados): Promise<Resultado> {
  const s = await exigirPerfil('loja');
  const p = schema.safeParse(dados);
  if (!p.success) {
    const campos: Record<string, string> = {};
    for (const i of p.error.issues) campos[i.path.join('.')] ??= i.message;
    return { ok: false, erro: 'Confira os campos destacados.', campos };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('configuracoes').update(p.data).eq('loja_id', s.perfil.loja_id!);
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  // Contagem/horário podem ter mudado: recalcula o prazo das OS em andamento
  await supabase.rpc('recalcular_prazos');
  revalidatePath('/', 'layout');
  return { ok: true };
}
