import 'server-only';
import type { LinhaOs } from '@/components/os/tabela-os';
import { normalizarPlaca } from './regras/placa';
import { pesoUrgencia } from './regras/sla';
import { carregarConfigSla, intervaloMs, slaDaOs } from './os-leitura';
import type { createClient } from './supabase/server';

type Sb = Awaited<ReturnType<typeof createClient>>;

const SELECT = 'id, numero, placa, renavam, marca_modelo, status, etapa, aberta_em, sla_horas, pausado_desde, total_pausado, concluida_em, cancelada_em, nome_solicitante, cidade, endereco, local_tipo, pagamento_status, unidade, patios(nome), empresas_clientes(razao_social, nome_fantasia)';

export async function buscarOs(supabase: Sb, opts: { status?: string[]; q?: string; limite?: number; comLaudo?: boolean }) {
  let q = supabase.from('ordens_servico').select(SELECT).order('aberta_em', { ascending: false }).limit(opts.limite ?? 500);
  if (opts.status?.length) q = q.in('status', opts.status);
  const termo = (opts.q ?? '').trim();
  if (termo) {
    const placa = normalizarPlaca(termo);
    const dig = termo.replace(/\D/g, '');
    const t = termo.replace(/[%,()]/g, ' ');
    const ors = [`placa.ilike.%${placa}%`, `marca_modelo.ilike.%${t}%`, `nome_solicitante.ilike.%${t}%`];
    if (dig.length >= 4) ors.push(`renavam.ilike.%${dig}%`);
    if (/^\d{1,12}$/.test(termo)) ors.push(`numero.eq.${termo}`);
    q = q.or(ors.join(','));
  }
  const [cfg, { data }] = await Promise.all([carregarConfigSla(supabase), q]);
  const agora = new Date();
  let laudos = new Map<string, { id: string; nome: string }>();
  if (opts.comLaudo && data?.length) {
    const ids = data.filter((o) => o.status === 'vistoriado').map((o) => o.id);
    if (ids.length) {
      const { data: ls } = await supabase.from('anexos').select('id, os_id, nome_arquivo').eq('tipo', 'laudo').eq('atual', true).in('os_id', ids);
      laudos = new Map((ls ?? []).map((l) => [l.os_id, { id: l.id, nome: l.nome_arquivo }]));
    }
  }
  // Motivo das pausas abertas (pausa manual, pendência ou frustração)
  const pausas = new Map<string, string>();
  const pausadas = (data ?? []).filter((o) => o.pausado_desde && (o.status === 'a_vistoriar' || o.status === 'frustrado')).map((o) => o.id);
  if (pausadas.length) {
    const { data: ps } = await supabase.from('sla_pausas').select('os_id, origem, motivo, referencia_id, inicio').in('os_id', pausadas).is('fim', null).order('inicio');
    const refs = (ps ?? []).filter((p) => p.origem !== 'manual' && p.referencia_id).map((p) => p.referencia_id as string);
    const { data: pend } = refs.length ? await supabase.from('pendencias').select('id, descricao').in('id', refs) : { data: [] as { id: string; descricao: string }[] };
    const desc = new Map((pend ?? []).map((p) => [p.id, p.descricao]));
    const ROTULO = { manual: 'Pausa manual', pendencia: 'Pendência', frustracao: 'Frustração', aprovacao_preco: 'Aguardando aprovação de preço' } as Record<string, string>;
    for (const p of ps ?? []) {
      const detalhe = p.origem === 'manual' ? p.motivo : p.referencia_id ? desc.get(p.referencia_id) : null;
      const texto = [ROTULO[p.origem] ?? 'Pausa', detalhe].filter(Boolean).join(': ');
      pausas.set(p.os_id, pausas.has(p.os_id) ? `${pausas.get(p.os_id)} · ${texto}` : texto);
    }
  }
  const linhas: LinhaOs[] = (data ?? []).map((o) => {
    const emp = o.empresas_clientes as unknown as { razao_social: string; nome_fantasia: string | null } | null;
    return {
      id: o.id, numero: o.numero, placa: o.placa, marca_modelo: o.marca_modelo, status: o.status, etapa: o.etapa, aberta_em: o.aberta_em,
      nome_solicitante: o.nome_solicitante, cidade: o.cidade,
      local: o.local_tipo === 'patio' ? (o.patios as unknown as { nome: string } | null)?.nome ?? null : o.endereco,
      cliente: emp?.nome_fantasia || emp?.razao_social, pagamento_status: o.pagamento_status,
      sla: slaDaOs(o, cfg, undefined, agora),
      entrada: { aberta_em: o.aberta_em, sla_horas: o.sla_horas, status: o.status, total_pausado_ms: intervaloMs(o.total_pausado), pausado_desde: o.pausado_desde, concluida_em: o.concluida_em, cancelada_em: o.cancelada_em },
      laudo: laudos.get(o.id) ?? null,
      patio: (o.patios as unknown as { nome: string } | null)?.nome ?? null, unidade: o.unidade ?? null,
      motivoPausa: pausas.get(o.id) ?? null,
    };
  });
  return { linhas, cfg };
}

export function ordenarPorUrgencia(l: LinhaOs[]) {
  return [...l].sort((a, b) => pesoUrgencia(a.sla) - pesoUrgencia(b.sla));
}

/** Filtro por vários locais: valores `p:<pátio>` e `u:<unidade>` (da URL, parâmetro `local`). Vazio = todos. */
export function lerLocais(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v : v ? [v] : []).filter((x) => /^[pu]:./.test(x)).slice(0, 200);
}
export function filtrarPorLocal(l: LinhaOs[], locais: string[]) {
  if (!locais.length) return l;
  const sel = new Set(locais);
  return l.filter((o) => (o.patio && sel.has(`p:${o.patio}`)) || (o.unidade && sel.has(`u:${o.unidade}`)));
}
/** Opções do filtro (pátios e unidades presentes nas OS), com quantidade. */
export function opcoesDeLocal(l: LinhaOs[]) {
  const conta = new Map<string, number>();
  for (const o of l) {
    if (o.patio) conta.set(`p:${o.patio}`, (conta.get(`p:${o.patio}`) ?? 0) + 1);
    if (o.unidade) conta.set(`u:${o.unidade}`, (conta.get(`u:${o.unidade}`) ?? 0) + 1);
  }
  const lista = [...conta].map(([valor, qtd]) => ({ valor, rotulo: valor.slice(2), tipo: valor[0] === 'p' ? 'patio' as const : 'unidade' as const, qtd }));
  return lista.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
