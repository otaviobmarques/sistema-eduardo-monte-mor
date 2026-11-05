'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { mensagemErroBanco, type Resultado } from '@/lib/cadastros';

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato 08:00.');
const schema = z.object({
  alerta1_horas: z.coerce.number().int().min(1, 'Mínimo de 1 hora.').max(47, 'Precisa ser menor que o SLA.'),
  alerta2_horas_antes: z.coerce.number().int().min(1, 'Mínimo de 1 hora.').max(47, 'Precisa ser menor que o SLA.'),
  contagem: z.enum(['corridas', 'uteis']),
  horario_util: z.object({ dias: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha pelo menos um dia.'), inicio: hora, fim: hora })
    .refine((h) => h.inicio < h.fim, { message: 'O fim precisa ser depois do início.', path: ['fim'] }),
  escalonar_minutos: z.coerce.number().int().min(5, 'Mínimo de 5 minutos.').max(1440, 'Máximo de 24 horas.'),
  ajuste_preco_habilitado: z.coerce.boolean(),
});
export type ConfigDados = z.input<typeof schema>;

export async function salvarConfiguracoes(dados: ConfigDados): Promise<Resultado> {
  await exigirPerfil('loja');
  const p = schema.safeParse(dados);
  if (!p.success) {
    const campos: Record<string, string> = {};
    for (const i of p.error.issues) campos[i.path.join('.')] ??= i.message;
    return { ok: false, erro: 'Confira os campos destacados.', campos };
  }
  const supabase = await createClient();
  const { error } = await supabase.from('configuracoes').update(p.data).eq('id', 1);
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  revalidatePath('/loja/configuracoes');
  return { ok: true };
}
