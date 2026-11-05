import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { limitesDoMes, mesSeguinte, totalizar, valorDaOs, type StatusPagamento } from '@/lib/regras/financeiro';
import { normalizarPlaca } from '@/lib/regras/placa';
import { todasAsLinhas } from '@/lib/supabase/paginar';

type Sb = Awaited<ReturnType<typeof createClient>>;

export interface LinhaFinanceira {
  id: string; numero: number; placa: string; marca_modelo: string | null; status: string;
  aberta_em: string; concluida_em: string | null; valor: number; valor_congelado: boolean;
  pagamento_status: StatusPagamento; pagamento_forma: string | null; pagamento_data: string | null; pagamento_obs: string | null;
  empresa_id: string; cliente: string; forma_cobranca: 'faturado' | 'avulso' | null;
}

const SELECT = 'id, numero, placa, marca_modelo, status, aberta_em, concluida_em, valor_base, valor_deslocamento, valor_ajuste, valor_final, pagamento_status, pagamento_forma, pagamento_data, pagamento_obs, empresa_cliente_id, empresas_clientes(nome_fantasia, razao_social, forma_cobranca)';

function mapear(o: Record<string, unknown>): LinhaFinanceira {
  const e = o.empresas_clientes as { nome_fantasia: string | null; razao_social: string; forma_cobranca: 'faturado' | 'avulso' } | null;
  return {
    id: o.id as string, numero: o.numero as number, placa: o.placa as string, marca_modelo: o.marca_modelo as string | null,
    status: o.status as string, aberta_em: o.aberta_em as string, concluida_em: o.concluida_em as string | null,
    valor: valorDaOs(o as never), valor_congelado: o.valor_final !== null,
    pagamento_status: o.pagamento_status as StatusPagamento, pagamento_forma: o.pagamento_forma as string | null,
    pagamento_data: o.pagamento_data as string | null, pagamento_obs: o.pagamento_obs as string | null,
    empresa_id: o.empresa_cliente_id as string, cliente: e?.nome_fantasia || e?.razao_social || '—', forma_cobranca: e?.forma_cobranca ?? null,
  };
}

/** Pagamentos por placa (OS não canceladas). A RLS limita à Loja ou à empresa do usuário. */
export async function buscarPagamentos(sb: Sb, f: { cliente?: string; situacao?: string; q?: string; mes?: string }) {
  const termo = (f.q ?? '').trim();
  const data = await todasAsLinhas<Record<string, unknown>>((de, ate) => {
    let q = sb.from('ordens_servico').select(SELECT).neq('status', 'cancelado').order('concluida_em', { ascending: false, nullsFirst: false }).order('numero', { ascending: false }).range(de, ate);
    if (f.cliente && /^[0-9a-f-]{36}$/.test(f.cliente)) q = q.eq('empresa_cliente_id', f.cliente);
    if (f.mes) { const { inicio, fim } = limitesDoMes(f.mes); q = q.gte('concluida_em', inicio).lt('concluida_em', fim); }
    if (termo) q = /^\d+$/.test(termo) ? q.or(`numero.eq.${termo},renavam.eq.${termo.padStart(11, '0')}`) : q.ilike('placa', `%${normalizarPlaca(termo)}%`);
    return q as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
  }, 20_000);
  const todas = data.map(mapear);
  const situacao = ['pendente', 'pago', 'faturado'].includes(f.situacao ?? '') ? f.situacao : '';
  return { todas, linhas: situacao ? todas.filter((l) => l.pagamento_status === situacao) : todas };
}

/** KPIs do painel financeiro: pendente (concluídas), recebido e faturado no mês corrente. */
export async function kpisFinanceiros(sb: Sb, mes: string, cliente?: string) {
  const { inicio, fim } = limitesDoMes(mes);
  const diaIni = `${mes}-01`, diaFim = `${mesSeguinte(mes)}-01`;
  type Lv = { valor_base: number; valor_deslocamento: number; valor_ajuste: number; valor_final: number | null; pagamento_status: StatusPagamento };
  const base = () => {
    let q = sb.from('ordens_servico').select('valor_base, valor_deslocamento, valor_ajuste, valor_final, pagamento_status').neq('status', 'cancelado').order('numero');
    if (cliente && /^[0-9a-f-]{36}$/.test(cliente)) q = q.eq('empresa_cliente_id', cliente);
    return q;
  };
  type R = PromiseLike<{ data: Lv[] | null; error: { message: string } | null }>;
  const [pend, pagos, conc] = await Promise.all([
    todasAsLinhas<Lv>((a, b) => base().eq('status', 'vistoriado').eq('pagamento_status', 'pendente').range(a, b) as unknown as R),
    todasAsLinhas<Lv>((a, b) => base().in('pagamento_status', ['pago', 'faturado']).gte('pagamento_data', diaIni).lt('pagamento_data', diaFim).range(a, b) as unknown as R),
    todasAsLinhas<Lv>((a, b) => base().eq('status', 'vistoriado').gte('concluida_em', inicio).lt('concluida_em', fim).range(a, b) as unknown as R),
  ]);
  const tot = (l: Lv[]) => totalizar(l.map((o) => ({ valor: valorDaOs(o), pagamento_status: o.pagamento_status })));
  return { pendente: tot(pend), baixados: tot(pagos), concluidas: tot(conc) };
}

/** Fechamento mensal: OS vistoriadas no mês (data do laudo), com totais por cliente. */
export async function fechamentoMensal(sb: Sb, mes: string, cliente?: string) {
  const { linhas } = await buscarPagamentos(sb, { mes, cliente });
  const vist = linhas.filter((l) => l.status === 'vistoriado').sort((a, b) => a.cliente.localeCompare(b.cliente, 'pt-BR') || (a.concluida_em ?? '').localeCompare(b.concluida_em ?? ''));
  const porCliente = new Map<string, { empresa_id: string; cliente: string; forma_cobranca: LinhaFinanceira['forma_cobranca']; linhas: LinhaFinanceira[] }>();
  for (const l of vist) {
    const g = porCliente.get(l.empresa_id) ?? { empresa_id: l.empresa_id, cliente: l.cliente, forma_cobranca: l.forma_cobranca, linhas: [] };
    g.linhas.push(l); porCliente.set(l.empresa_id, g);
  }
  const grupos = [...porCliente.values()].map((g) => ({ ...g, totais: totalizar(g.linhas) }));
  return { linhas: vist, grupos, totais: totalizar(vist) };
}
