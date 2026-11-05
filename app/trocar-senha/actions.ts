'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const senhaSchema = z
  .object({
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(72, 'Senha longa demais.'),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, { message: 'As senhas não conferem.', path: ['confirmacao'] });

export type TrocaState = { erro?: string } | undefined;

export async function trocarSenha(_: TrocaState, form: FormData): Promise<TrocaState> {
  const parsed = senhaSchema.safeParse({ senha: form.get('senha'), confirmacao: form.get('confirmacao') });
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha });
  if (error) {
    return { erro: error.message.includes('different') ? 'A nova senha precisa ser diferente da temporária.' : 'Não foi possível trocar a senha. Tente de novo.' };
  }
  const { error: e2 } = await supabase.rpc('concluir_troca_senha');
  if (e2) return { erro: 'Senha trocada, mas não foi possível liberar o acesso. Tente de novo.' };
  const { data: perfil } = await supabase.from('perfis_usuario').select('perfil').eq('user_id', user.id).single();
  redirect(perfil?.perfil === 'loja' ? '/loja' : '/app');
}
