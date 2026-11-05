'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_ANEXO, TIPOS_ANEXO_OK } from '@/lib/os';
import { FORMAS_PAGAMENTO } from '@/lib/regras/financeiro';
import type { Resultado } from '@/lib/cadastros';

const MSG: Record<string, string> = {
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  NENHUMA_OS: 'Selecione ao menos uma OS.',
  FORMA_DATA_OBRIGATORIAS: 'Para marcar como pago, informe a forma e a data do pagamento.',
  DATA_FUTURA: 'A data do pagamento não pode estar no futuro.',
  OS_CANCELADA: 'Uma das OS foi cancelada e não recebe pagamento. Atualize a página.',
  OS_NAO_ENCONTRADA: 'Uma das OS não foi encontrada. Atualize a página.',
};

const esquema = z.object({
  os: z.array(z.string().uuid()).min(1, 'Selecione ao menos uma OS.').max(500, 'Dê baixa em até 500 OS por vez.'),
  status: z.enum(['pago', 'faturado', 'pendente'], { errorMap: () => ({ message: 'Escolha a situação.' }) }),
  forma: z.string().trim().optional(),
  data: z.string().trim().optional(),
  obs: z.string().trim().max(500, 'Use até 500 caracteres.').optional(),
}).superRefine((v, ctx) => {
  if (v.status === 'pago') {
    if (!v.forma || !(v.forma in FORMAS_PAGAMENTO)) ctx.addIssue({ code: 'custom', path: ['forma'], message: 'Escolha a forma de pagamento.' });
    if (!v.data || !/^\d{4}-\d{2}-\d{2}$/.test(v.data)) ctx.addIssue({ code: 'custom', path: ['data'], message: 'Informe a data do pagamento.' });
  }
});

/** Baixa de pagamento de uma ou várias OS, com comprovante opcional (JPG, PNG ou PDF). */
export async function registrarPagamento(form: FormData): Promise<Resultado<{ qtd: number }>> {
  const s = await getSessao();
  if (!s || s.perfil.perfil !== 'loja' || s.perfil.bloqueado || s.perfil.deve_trocar_senha) return { ok: false, erro: 'Sem permissão.' };
  let ids: unknown = [];
  try { ids = JSON.parse(String(form.get('os') ?? '[]')); } catch { /* validado abaixo */ }
  const p = esquema.safeParse({ os: ids, status: form.get('status'), forma: form.get('forma') ?? undefined, data: form.get('data') ?? undefined, obs: form.get('obs') ?? undefined });
  if (!p.success) {
    const campos: Record<string, string> = {};
    for (const i of p.error.issues) campos[String(i.path[0])] ??= i.message;
    return { ok: false, erro: campos.os ?? 'Confira os campos.', campos };
  }
  const v = p.data;
  const arq = form.get('comprovante');
  const comprovante = arq instanceof File && arq.size > 0 ? arq : null;
  if (comprovante && !TIPOS_ANEXO_OK.includes(comprovante.type)) return { ok: false, erro: 'O comprovante precisa ser JPG, PNG ou PDF.', campos: { comprovante: 'Use JPG, PNG ou PDF.' } };
  if (comprovante && comprovante.size > MAX_ANEXO) return { ok: false, erro: 'O comprovante pode ter até 20 MB.', campos: { comprovante: 'Limite de 20 MB.' } };

  const supabase = await createClient();
  const { data: oss } = await supabase.from('ordens_servico').select('id, numero, empresa_cliente_id').in('id', v.os);
  if (!oss || oss.length !== new Set(v.os).size) return { ok: false, erro: MSG.OS_NAO_ENCONTRADA };

  const forma = v.status === 'faturado' ? (v.forma && v.forma in FORMAS_PAGAMENTO ? v.forma : 'faturamento') : v.forma;
  const { data: qtd, error } = await supabase.rpc('registrar_pagamento', {
    p_os: v.os, p_status: v.status, p_forma: v.status === 'pendente' ? null : forma, p_data: v.status === 'pendente' ? null : v.data || null, p_obs: v.obs || null,
  });
  if (error) {
    const k = Object.keys(MSG).find((x) => error.message.includes(x));
    return { ok: false, erro: k ? MSG[k] : 'Não foi possível registrar. Tente de novo.' };
  }

  let aviso: string | null = null;
  if (comprovante && v.status !== 'pendente') {
    // Um arquivo por empresa (a pasta da empresa define quem pode ler), uma linha de anexo por OS
    const admin = createAdminClient();
    const limpo = comprovante.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80);
    for (const emp of [...new Set(oss.map((o) => o.empresa_cliente_id))]) {
      const caminho = `${emp}/pagamentos/comprovante-${randomUUID().slice(0, 8)}-${limpo}`;
      const { error: up } = await supabase.storage.from('anexos').upload(caminho, comprovante, { contentType: comprovante.type, upsert: false });
      if (up) { aviso = 'O pagamento foi registrado, mas o comprovante não foi enviado. Anexe pela ficha da OS.'; continue; }
      const daEmpresa = oss.filter((o) => o.empresa_cliente_id === emp);
      await admin.from('anexos').insert(daEmpresa.map((o) => ({ os_id: o.id, tipo: 'comprovante', bucket: 'anexos', storage_path: caminho, nome_arquivo: comprovante.name, tamanho_bytes: comprovante.size, enviado_por: s.userId })));
      await admin.from('historico_os').insert(daEmpresa.map((o) => ({ os_id: o.id, evento: 'Comprovante de pagamento', para: comprovante.name, usuario_id: s.userId, nome_exibicao: s.perfil.nome_exibicao })));
    }
  }

  for (const o of oss) { revalidatePath(`/loja/os/${o.numero}`); revalidatePath(`/app/os/${o.numero}`); }
  revalidatePath('/loja/financeiro', 'layout'); revalidatePath('/app/financeiro', 'layout'); revalidatePath('/loja'); revalidatePath('/app');
  if (aviso) return { ok: false, erro: aviso };
  return { ok: true, dados: { qtd: qtd as number } };
}
