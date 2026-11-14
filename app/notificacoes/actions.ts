'use server';
import { z } from 'zod';
import { getSessao } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function sessao() {
  const s = await getSessao();
  if (!s || s.perfil.bloqueado || s.perfil.perfil === 'admin') throw new Error('Sessão inválida');
  return s;
}
const destinoDe = (perfil: string) => (perfil === 'loja' ? 'loja' : 'cliente');

/** Registra vista_em/vista_por (alimenta “tempo até o primeiro atendimento”). RLS limita à própria Loja/empresa. */
export async function marcarVistas(filtro: { ids?: string[]; osId?: string; loteId?: string; todas?: boolean }) {
  const s = await sessao();
  const supabase = await createClient();
  let q = supabase.from('notificacoes').update({ vista_em: new Date().toISOString(), vista_por: s.userId })
    .is('vista_em', null).eq('destino', destinoDe(s.perfil.perfil));
  if (filtro.ids?.length) q = q.in('id', filtro.ids.filter((i) => z.string().uuid().safeParse(i).success));
  else if (filtro.osId) q = q.eq('os_id', filtro.osId);
  else if (filtro.loteId) q = q.eq('lote_id', filtro.loteId);
  else if (!filtro.todas) return { ok: false };
  const { error } = await q;
  return { ok: !error };
}

const inscricao = z.object({ endpoint: z.string().url().max(1000), keys: z.object({ p256dh: z.string().min(10), auth: z.string().min(5) }) });

export async function salvarInscricaoPush(sub: unknown) {
  const s = await sessao();
  const p = inscricao.safeParse(sub);
  if (!p.success) return { ok: false };
  const supabase = await createClient();
  await createAdminClient().from('push_inscricoes').delete().eq('endpoint', p.data.endpoint); // mesmo aparelho, outro usuário
  const { error } = await supabase.from('push_inscricoes').insert({ user_id: s.userId, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth });
  return { ok: !error };
}

export async function removerInscricaoPush(endpoint: string) {
  await sessao();
  const supabase = await createClient();
  await supabase.from('push_inscricoes').delete().eq('endpoint', endpoint);
  return { ok: true };
}

/** Confirmação de leitura (pop-up das novas vistorias do dia): grava quem/quando e entra na linha do tempo da OS. */
export async function confirmarLeitura(ids: string[]) {
  const s = await sessao();
  if (s.perfil.perfil !== 'loja') return { ok: false, erro: 'Só a Loja confirma a leitura.' };
  const validos = ids.filter((i) => z.string().uuid().safeParse(i).success).slice(0, 500);
  if (!validos.length) return { ok: false, erro: 'Marque ao menos uma vistoria.' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('confirmar_leitura', { p_ids: validos });
  if (error) return { ok: false, erro: 'Não foi possível confirmar agora. Tente de novo.' };
  return { ok: true, confirmadas: (data as number) ?? 0 };
}
