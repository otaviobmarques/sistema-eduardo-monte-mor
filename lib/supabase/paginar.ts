/** Busca todas as linhas de uma consulta em páginas de 1000 (limite por resposta da API do Supabase). */
export async function todasAsLinhas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, maximo = 50_000): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < maximo; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
