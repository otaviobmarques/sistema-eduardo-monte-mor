import 'server-only';
import type { DadosNovaOs } from '@/components/os/nova-os-form';
import type { createClient } from './supabase/server';

type Sb = Awaited<ReturnType<typeof createClient>>;

export async function carregarDadosNovaOs(supabase: Sb, modo: 'cliente' | 'loja', empresaFixa?: string): Promise<DadosNovaOs> {
  const [emp, cat, serv, pat, pr, prc, tx] = await Promise.all([
    supabase.from('empresas_clientes').select('id, razao_social, nome_fantasia, sla_horas, usa_tabela_propria').eq('ativo', true).order('razao_social'),
    supabase.from('categorias_veiculo').select('id, nome').order('ordem'),
    supabase.from('servicos').select('id, nome, sla_horas, padrao').eq('ativo', true).order('nome'),
    supabase.from('patios').select('id, nome, cidade, uf').eq('ativo', true).order('nome'),
    supabase.from('precos').select('servico_id, categoria_id, valor'),
    supabase.from('precos_cliente').select('empresa_cliente_id, servico_id, categoria_id, valor'),
    supabase.from('taxas_deslocamento').select('cidade, uf, valor'),
  ]);
  const proprios: Record<string, Record<string, number>> = {};
  for (const p of prc.data ?? []) (proprios[p.empresa_cliente_id] ??= {})[`${p.servico_id}:${p.categoria_id}`] = Number(p.valor);
  return {
    modo,
    empresaFixa,
    empresas: (emp.data ?? []).map((e) => ({ id: e.id, nome: e.nome_fantasia || e.razao_social, sla_horas: e.sla_horas, usa_tabela_propria: e.usa_tabela_propria })),
    categorias: cat.data ?? [],
    servicos: serv.data ?? [],
    patios: pat.data ?? [],
    precosPadrao: Object.fromEntries((pr.data ?? []).map((p) => [`${p.servico_id}:${p.categoria_id}`, Number(p.valor)])),
    precosProprios: proprios,
    taxas: (tx.data ?? []).map((t) => ({ ...t, valor: Number(t.valor) })),
  };
}
