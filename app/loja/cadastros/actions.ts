'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirPerfil } from '@/lib/sessao';
import { createClient } from '@/lib/supabase/server';
import { EXCLUIVEL, ROTA_CADASTRO, SCHEMAS, mensagemErroBanco, type Resultado, type TabelaCadastro } from '@/lib/cadastros';

function errosDeCampo(err: z.ZodError) {
  const campos: Record<string, string> = {};
  for (const i of err.issues) campos[String(i.path[0])] ??= i.message;
  return campos;
}

export async function salvarCadastro(tabela: TabelaCadastro, id: string | null, dados: Record<string, unknown>): Promise<Resultado> {
  await exigirPerfil('loja');
  const schema = SCHEMAS[tabela];
  if (!schema) return { ok: false, erro: 'Cadastro inválido.' };
  const parsed = schema.safeParse(dados);
  if (!parsed.success) return { ok: false, erro: 'Confira os campos destacados.', campos: errosDeCampo(parsed.error) };
  const supabase = await createClient();
  const valores = parsed.data as Record<string, unknown>;

  if (tabela === 'servicos' && valores.padrao) {
    await supabase.from('servicos').update({ padrao: false }).neq('id', id ?? '00000000-0000-0000-0000-000000000000');
  }
  const q = id ? supabase.from(tabela).update(valores).eq('id', id) : supabase.from(tabela).insert(valores);
  const { error } = await q;
  if (error) return { ok: false, erro: mensagemErroBanco(error) };

  // Novo serviço ganha linha zerada na tabela padrão para cada categoria
  if (tabela === 'servicos' && !id) {
    const { data: s } = await supabase.from('servicos').select('id').eq('nome', valores.nome as string).single();
    const { data: cats } = await supabase.from('categorias_veiculo').select('id');
    if (s && cats?.length) await supabase.from('precos').upsert(cats.map((c) => ({ servico_id: s.id, categoria_id: c.id, valor: 0 })), { onConflict: 'servico_id,categoria_id', ignoreDuplicates: true });
  }
  revalidatePath(ROTA_CADASTRO[tabela]);
  return { ok: true };
}

export async function alternarAtivo(tabela: TabelaCadastro, id: string, ativo: boolean): Promise<Resultado> {
  await exigirPerfil('loja');
  if (!('ativo' in SCHEMAS[tabela].shape)) return { ok: false, erro: 'Este cadastro não tem situação.' };
  const supabase = await createClient();
  const { error } = await supabase.from(tabela).update({ ativo }).eq('id', id);
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  revalidatePath(ROTA_CADASTRO[tabela]);
  return { ok: true };
}

export async function excluirCadastro(tabela: TabelaCadastro, id: string): Promise<Resultado> {
  await exigirPerfil('loja');
  if (!EXCLUIVEL.includes(tabela)) return { ok: false, erro: 'Este cadastro não pode ser excluído. Desative-o.' };
  const supabase = await createClient();
  const { error } = await supabase.from(tabela).delete().eq('id', id);
  if (error) return { ok: false, erro: mensagemErroBanco(error) };
  revalidatePath(ROTA_CADASTRO[tabela]);
  return { ok: true };
}

const itemPreco = z.object({ servico_id: z.string().uuid(), categoria_id: z.string().uuid(), valor: z.number().min(0).nullable() });

/** empresaId null = tabela padrão; com empresa = preços próprios (valor null remove e volta para a padrão). */
export async function salvarPrecos(empresaId: string | null, itens: z.infer<typeof itemPreco>[]): Promise<Resultado> {
  await exigirPerfil('loja');
  const parsed = z.array(itemPreco).safeParse(itens);
  if (!parsed.success) return { ok: false, erro: 'Há valores inválidos na tabela. Use números positivos.' };
  const supabase = await createClient();
  if (!empresaId) {
    const linhas = parsed.data.map((i) => ({ servico_id: i.servico_id, categoria_id: i.categoria_id, valor: i.valor ?? 0 }));
    const { error } = await supabase.from('precos').upsert(linhas, { onConflict: 'servico_id,categoria_id' });
    if (error) return { ok: false, erro: mensagemErroBanco(error) };
    revalidatePath('/loja/cadastros/servicos');
  } else {
    const com = parsed.data.filter((i) => i.valor !== null).map((i) => ({ empresa_cliente_id: empresaId, servico_id: i.servico_id, categoria_id: i.categoria_id, valor: i.valor! }));
    const sem = parsed.data.filter((i) => i.valor === null);
    if (com.length) {
      const { error } = await supabase.from('precos_cliente').upsert(com, { onConflict: 'empresa_cliente_id,servico_id,categoria_id' });
      if (error) return { ok: false, erro: mensagemErroBanco(error) };
    }
    for (const i of sem) {
      await supabase.from('precos_cliente').delete().match({ empresa_cliente_id: empresaId, servico_id: i.servico_id, categoria_id: i.categoria_id });
    }
    revalidatePath(`/loja/clientes/${empresaId}`);
    revalidatePath('/loja/cadastros/precos-cliente');
  }
  return { ok: true };
}
