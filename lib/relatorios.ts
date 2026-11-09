import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { todasAsLinhas } from '@/lib/supabase/paginar';
import { agregar, agrupar, dataValida, limitesPeriodo, periodoPadrao, TIPOS_RELATORIO, tipoValido, filtrarParaTipo, type LinhaRel, type TipoRelatorio } from '@/lib/regras/relatorios';

type Sb = Awaited<ReturnType<typeof createClient>>;

export interface FiltrosRel { tipo?: string; de?: string; ate?: string; cliente?: string; cidade?: string; patio?: string; vistoriador?: string; status?: string; pagamento?: string; unidade?: string }
export const STATUS_REL = { a_vistoriar: 'A vistoriar', frustrado: 'Frustrado', vistoriado: 'Vistoriado', cancelado: 'Cancelado' } as const;
export const PAGAMENTO_REL = { pendente: 'Pendente', pago: 'Pago', faturado: 'Faturado' } as const;

const COLUNAS = 'unidade, numero, placa, marca_modelo, cliente, status, aberta_em, concluida_em, prazo_em, cidade, uf, local_tipo, patio, patio_id, vistoriador, vistoriador_id, empresa_cliente_id, valor, pagamento_status, mes_abertura, no_prazo, horas_conclusao, horas_atraso, vencida_aberta, pausada, foi_frustrada, motivo_frustracao, motivo_atraso, motivo_cancelamento';
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

/** Normaliza os filtros vindos da URL (o que não for válido é ignorado). */
export function normalizarFiltros(f: FiltrosRel, modo: 'loja' | 'cliente') {
  const p = periodoPadrao();
  const tipo = tipoValido(f.tipo, modo);
  return {
    tipo, de: dataValida(f.de, p.de), ate: dataValida(f.ate, p.ate),
    cliente: modo === 'loja' ? uuid(f.cliente) : undefined, patio: uuid(f.patio), vistoriador: modo === 'loja' ? uuid(f.vistoriador) : undefined,
    cidade: f.cidade?.trim() ? f.cidade.trim().slice(0, 80) : undefined,
    unidade: f.unidade?.trim() ? f.unidade.trim().slice(0, 120) : undefined,
    status: f.status && f.status in STATUS_REL ? (f.status as keyof typeof STATUS_REL) : undefined,
    pagamento: f.pagamento && f.pagamento in PAGAMENTO_REL ? (f.pagamento as keyof typeof PAGAMENTO_REL) : undefined,
  };
}
export type FiltrosNorm = ReturnType<typeof normalizarFiltros>;

/** Linhas de vw_os_sla do período (base: abertura ou conclusão, conforme o relatório). A RLS limita à Loja/empresa. */
export async function linhasRelatorio(sb: Sb, f: FiltrosNorm) {
  const { inicio, fim } = limitesPeriodo(f.de, f.ate);
  const campo = TIPOS_RELATORIO[f.tipo].base === 'conclusao' ? 'concluida_em' : 'aberta_em';
  type L = LinhaRel & { patio_id: string | null; vistoriador_id: string | null; empresa_cliente_id: string };
  return todasAsLinhas<L>((de, ate) => {
    let q = sb.from('vw_os_sla').select(COLUNAS).gte(campo, inicio).lt(campo, fim).order(campo).order('numero').range(de, ate);
    if (f.cliente) q = q.eq('empresa_cliente_id', f.cliente);
    if (f.patio) q = q.eq('patio_id', f.patio);
    if (f.vistoriador) q = q.eq('vistoriador_id', f.vistoriador);
    if (f.cidade) q = q.eq('cidade', f.cidade);
    if (f.unidade) q = q.eq('unidade', f.unidade);
    if (f.status) q = q.eq('status', f.status);
    if (f.pagamento) q = q.eq('pagamento_status', f.pagamento);
    return q as unknown as PromiseLike<{ data: L[] | null; error: { message: string } | null }>;
  }, 30_000);
}

export async function montarRelatorio(sb: Sb, f: FiltrosNorm) {
  const linhas = await linhasRelatorio(sb, f);
  const doTipo = filtrarParaTipo(f.tipo, linhas);
  return { linhas: doTipo, kpis: agregar(linhas), grupos: agrupar(f.tipo, linhas) };
}

/** Opções dos filtros (clientes, pátios, vistoriadores, cidades). */
export async function opcoesFiltro(sb: Sb, modo: 'loja' | 'cliente') {
  const [{ data: clientes }, { data: patios }, { data: vist }, { data: cidadesOs }] = await Promise.all([
    modo === 'loja' ? sb.from('empresas_clientes').select('id, nome_fantasia, razao_social').order('razao_social') : Promise.resolve({ data: [] as { id: string; nome_fantasia: string | null; razao_social: string }[] }),
    sb.from('patios').select('id, nome, cidade').order('nome'),
    modo === 'loja' ? sb.from('vistoriadores').select('id, nome').order('nome') : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    sb.from('vw_os_sla').select('cidade').not('cidade', 'is', null).limit(1000),
  ]);
  const { data: unidadesOs } = await sb.from('ordens_servico').select('unidade').not('unidade', 'is', null).order('unidade').limit(1000);
  const cidades = [...new Set([...(patios ?? []).map((p) => p.cidade), ...(cidadesOs ?? []).map((c) => c.cidade as string)].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    clientes: (clientes ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.razao_social })),
    patios: (patios ?? []).map((p) => ({ id: p.id, nome: p.nome })), vistoriadores: vist ?? [], cidades,
    unidades: [...new Set((unidadesOs ?? []).map((u) => (u.unidade as string).trim()))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
}

/** Texto dos filtros aplicados (para tela, Excel e PDF). */
export function descreverFiltros(f: FiltrosNorm, op: Awaited<ReturnType<typeof opcoesFiltro>>): string[] {
  const d = (s: string) => s.split('-').reverse().join('/');
  const base = TIPOS_RELATORIO[f.tipo].base === 'conclusao' ? 'concluídas' : 'abertas';
  const out = [`OS ${base} de ${d(f.de)} a ${d(f.ate)}`];
  if (f.cliente) out.push(`Cliente: ${op.clientes.find((c) => c.id === f.cliente)?.nome ?? '—'}`);
  if (f.cidade) out.push(`Cidade: ${f.cidade}`);
  if (f.unidade) out.push(`Unidade: ${f.unidade}`);
  if (f.patio) out.push(`Pátio: ${op.patios.find((p) => p.id === f.patio)?.nome ?? '—'}`);
  if (f.vistoriador) out.push(`Vistoriador: ${op.vistoriadores.find((v) => v.id === f.vistoriador)?.nome ?? '—'}`);
  if (f.status) out.push(`Status: ${STATUS_REL[f.status]}`);
  if (f.pagamento) out.push(`Pagamento: ${PAGAMENTO_REL[f.pagamento]}`);
  return out;
}

export function filtrosParaQuery(f: FiltrosNorm, extra: Record<string, string> = {}) {
  const o: Record<string, string> = { tipo: f.tipo, de: f.de, ate: f.ate, ...extra };
  for (const k of ['cliente', 'cidade', 'unidade', 'patio', 'vistoriador', 'status', 'pagamento'] as const) if (f[k]) o[k] = f[k]!;
  return new URLSearchParams(o).toString();
}

export type { TipoRelatorio };
