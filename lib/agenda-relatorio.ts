import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { todasAsLinhas } from '@/lib/supabase/paginar';
import { dataValida, limitesPeriodo } from '@/lib/regras/relatorios';
import { AGRUPAR_AGENDA, agruparAgenda, periodoAgendaPadrao, SITUACOES_AGENDA, situacaoAgenda, totaisAgenda, type AgruparAgenda, type LinhaAgenda, type SituacaoAgenda } from '@/lib/regras/agenda-relatorio';

type Sb = Awaited<ReturnType<typeof createClient>>;
export interface FiltrosAgenda { de?: string; ate?: string; vistoriador?: string; patio?: string; cliente?: string; situacao?: string; agrupar?: string }
const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined);

export function normalizarFiltrosAgenda(f: FiltrosAgenda) {
  const p = periodoAgendaPadrao();
  const de = dataValida(f.de, p.de), ate = dataValida(f.ate, p.ate);
  return {
    de: de <= ate ? de : ate, ate: de <= ate ? ate : de,
    vistoriador: uuid(f.vistoriador), patio: uuid(f.patio), cliente: uuid(f.cliente),
    situacao: (SITUACOES_AGENDA as readonly string[]).includes(f.situacao ?? '') ? (f.situacao as SituacaoAgenda) : undefined,
    // Com um vistoriador escolhido, o padrão é ver o dia a dia dele
    agrupar: (f.agrupar && f.agrupar in AGRUPAR_AGENDA ? f.agrupar : uuid(f.vistoriador) ? 'dia' : 'vistoriador') as AgruparAgenda,
  };
}
export type FiltrosAgendaNorm = ReturnType<typeof normalizarFiltrosAgenda>;

/** Agendamentos atuais (a última versão de cada OS) com data/hora no período. RLS: só a Loja do usuário. */
export async function montarRelatorioAgenda(sb: Sb, f: FiltrosAgendaNorm) {
  const { inicio, fim } = limitesPeriodo(f.de, f.ate);
  type Bruta = { data_hora: string; local_texto: string | null; vistoriador_id: string | null; vistoriadores: { nome: string } | null;
    ordens_servico: { numero: number; placa: string; status: LinhaAgenda['status']; patio_id: string | null; empresa_cliente_id: string; patios: { nome: string } | null; empresas_clientes: { nome_fantasia: string | null; razao_social: string } | null } };
  const brutas = await todasAsLinhas<Bruta>((a, b) => {
    let q = sb.from('os_agendamentos')
      .select('data_hora, local_texto, vistoriador_id, vistoriadores(nome), ordens_servico!inner(numero, placa, status, patio_id, empresa_cliente_id, patios(nome), empresas_clientes(nome_fantasia, razao_social))')
      .eq('atual', true).gte('data_hora', inicio).lt('data_hora', fim).order('data_hora').range(a, b);
    if (f.vistoriador) q = q.eq('vistoriador_id', f.vistoriador);
    if (f.patio) q = q.eq('ordens_servico.patio_id', f.patio);
    if (f.cliente) q = q.eq('ordens_servico.empresa_cliente_id', f.cliente);
    return q as unknown as PromiseLike<{ data: Bruta[] | null; error: { message: string } | null }>;
  }, 20_000);
  const agora = new Date();
  let linhas: (LinhaAgenda & { situacao: SituacaoAgenda })[] = brutas.map((r) => {
    const o = r.ordens_servico;
    const l: LinhaAgenda = {
      numero: o.numero, placa: o.placa, cliente: o.empresas_clientes?.nome_fantasia || o.empresas_clientes?.razao_social || null,
      patio: o.patios?.nome ?? null, local: r.local_texto, data_hora: r.data_hora, vistoriador: r.vistoriadores?.nome ?? null, status: o.status,
    };
    return { ...l, situacao: situacaoAgenda(l, agora) };
  });
  if (f.situacao) linhas = linhas.filter((l) => l.situacao === f.situacao);
  return { linhas, totais: totaisAgenda(linhas, agora), grupos: agruparAgenda(linhas, f.agrupar, agora) };
}

export async function opcoesAgenda(sb: Sb) {
  const [{ data: vist }, { data: patios }, { data: clientes }] = await Promise.all([
    sb.from('vistoriadores').select('id, nome').order('nome'),
    sb.from('patios').select('id, nome').order('nome'),
    sb.from('empresas_clientes').select('id, nome_fantasia, razao_social').order('razao_social'),
  ]);
  return { vistoriadores: vist ?? [], patios: patios ?? [], clientes: (clientes ?? []).map((c) => ({ id: c.id, nome: c.nome_fantasia || c.razao_social })) };
}

export function descreverFiltrosAgenda(f: FiltrosAgendaNorm, op: Awaited<ReturnType<typeof opcoesAgenda>>): string[] {
  const d = (s: string) => s.split('-').reverse().join('/');
  const out = [`Agendamentos de ${d(f.de)} a ${d(f.ate)}`];
  if (f.vistoriador) out.push(`Vistoriador: ${op.vistoriadores.find((v) => v.id === f.vistoriador)?.nome ?? '—'}`);
  if (f.patio) out.push(`Pátio: ${op.patios.find((p) => p.id === f.patio)?.nome ?? '—'}`);
  if (f.cliente) out.push(`Cliente: ${op.clientes.find((c) => c.id === f.cliente)?.nome ?? '—'}`);
  if (f.situacao) out.push(`Situação: ${f.situacao}`);
  out.push(`Agrupado por ${AGRUPAR_AGENDA[f.agrupar].toLowerCase()}`);
  return out;
}

export function queryAgenda(f: FiltrosAgendaNorm, extra: Record<string, string> = {}) {
  const o: Record<string, string> = { de: f.de, ate: f.ate, agrupar: f.agrupar, ...extra };
  for (const k of ['vistoriador', 'patio', 'cliente', 'situacao'] as const) if (f[k]) o[k] = f[k]!;
  return new URLSearchParams(o).toString();
}
