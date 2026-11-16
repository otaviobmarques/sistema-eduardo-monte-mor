import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import { todasAsLinhas } from '@/lib/supabase/paginar';
import { limitesDoMes, mesReferencia } from '@/lib/regras/financeiro';
import { contarProducao, inicioBuscaProducao } from '@/lib/regras/producao';

type Sb = Awaited<ReturnType<typeof createClient>>;
const soma = (l: { valor: number | string | null }[]) => l.reduce((s, x) => s + Math.round(Number(x.valor ?? 0) * 100), 0) / 100;

/** Números do mês corrente (Brasília) a partir de vw_os_sla. A RLS limita à Loja ou à empresa do usuário. */
export async function numerosDoMes(sb: Sb, empresaId?: string) {
  // Visão do cliente aberta pela Loja: limita à empresa (o próprio cliente já é limitado pela RLS)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emp = (q: any) => (empresaId ? q.eq('empresa_cliente_id', empresaId) : q);
  const mes = mesReferencia(null);
  const { inicio, fim } = limitesDoMes(mes);
  const [concl, abertas, { count: canc }, pend] = await Promise.all([
    todasAsLinhas<{ no_prazo: boolean | null; motivo_atraso: string | null }>((a, b) => emp(sb.from('vw_os_sla').select('no_prazo, motivo_atraso')).eq('status', 'vistoriado').gte('concluida_em', inicio).lt('concluida_em', fim).order('numero').range(a, b)),
    todasAsLinhas<{ foi_frustrada: boolean | null }>((a, b) => emp(sb.from('vw_os_sla').select('foi_frustrada')).gte('aberta_em', inicio).lt('aberta_em', fim).order('numero').range(a, b)),
    emp(sb.from('ordens_servico').select('id', { count: 'exact', head: true })).eq('status', 'cancelado').gte('cancelada_em', inicio).lt('cancelada_em', fim),
    todasAsLinhas<{ valor: number | string | null }>((a, b) => emp(sb.from('vw_os_sla').select('valor')).eq('status', 'vistoriado').eq('pagamento_status', 'pendente').order('numero').range(a, b)),
  ]);
  // Placas do mês (abertas no mês), em qualquer status menos cancelado: valor a receber e ranking por pátio
  const doMes = await todasAsLinhas<{ valor: number | string | null; pagamento_status: string; status: string; patio: string | null; local_tipo: string }>((a, b) =>
    emp(sb.from('vw_os_sla').select('valor, pagamento_status, status, patio, local_tipo')).neq('status', 'cancelado').gte('aberta_em', inicio).lt('aberta_em', fim).order('numero').range(a, b));
  const pendMes = doMes.filter((o) => o.pagamento_status === 'pendente');
  const porPatio = new Map<string, { patio: string; total: number; vistoriadas: number }>();
  for (const o of doMes) {
    const nome = o.patio ?? (o.local_tipo === 'endereco' ? 'Outro endereço' : 'Sem pátio');
    const g = porPatio.get(nome) ?? { patio: nome, total: 0, vistoriadas: 0 };
    g.total++; if (o.status === 'vistoriado') g.vistoriadas++;
    porPatio.set(nome, g);
  }
  const vist = concl;
  const noPrazo = vist.filter((o) => o.no_prazo).length;
  const motivos = new Map<string, number>();
  for (const o of vist) if (!o.no_prazo && o.motivo_atraso) motivos.set(o.motivo_atraso, (motivos.get(o.motivo_atraso) ?? 0) + 1);
  const semMotivo = vist.filter((o) => !o.no_prazo && !o.motivo_atraso).length;
  return {
    mes, vistoriadas: vist.length, noPrazo, pctNoPrazo: vist.length ? Math.round((noPrazo / vist.length) * 1000) / 10 : null,
    recebidas: abertas.length, frustradasNoMes: abertas.filter((o) => o.foi_frustrada).length, canceladasNoMes: canc ?? 0,
    aReceber: soma(pend), qtdAReceber: pend.length,
    /** Todas as placas abertas no mês (exceto canceladas) com pagamento pendente. */
    aReceberMes: soma(pendMes), qtdAReceberMes: pendMes.length, placasDoMes: doMes.length,
    rankingPatios: [...porPatio.values()].sort((a, b) => b.total - a.total || a.patio.localeCompare(b.patio, 'pt-BR')),
    motivosAtraso: [...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([motivo, qtd]) => ({ motivo, qtd })), semMotivo,
  };
}

/** Agenda de hoje por vistoriador (Loja). */
export async function vistoriadoresHoje(sb: Sb) {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const amanha = new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() + 86_400_000).toISOString().slice(0, 10);
  const { data } = await sb.from('os_agendamentos').select('data_hora, vistoriadores(nome), ordens_servico!inner(status)')
    .eq('atual', true).neq('ordens_servico.status', 'cancelado')
    .gte('data_hora', `${hoje}T00:00:00-03:00`).lt('data_hora', `${amanha}T00:00:00-03:00`).order('data_hora');
  const por = new Map<string, { nome: string; qtd: number; primeira: string }>();
  for (const a of data ?? []) {
    const nome = (a.vistoriadores as unknown as { nome: string } | null)?.nome ?? 'Sem vistoriador';
    const g = por.get(nome) ?? { nome, qtd: 0, primeira: a.data_hora };
    g.qtd++; por.set(nome, g);
  }
  return [...por.values()].sort((a, b) => b.qtd - a.qtd);
}

/** Vistorias feitas por vistoriador (OS vistoriadas pela data da conclusão): hoje, semana, quinzena e mês. */
export async function producaoVistoriadores(sb: Sb) {
  const agora = new Date();
  const os = await todasAsLinhas<{ vistoriador: string | null; concluida_em: string | null }>((a, b) =>
    sb.from('vw_os_sla').select('vistoriador, concluida_em').eq('status', 'vistoriado').gte('concluida_em', inicioBuscaProducao(agora).toISOString()).order('numero').range(a, b));
  return contarProducao(os, agora);
}

/** OS que chegaram hoje (Brasília), pela criação no sistema. Importação de histórico feita pela Loja não conta. */
export async function chegadasDeHoje(sb: Sb) {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  type Linha = { id: string; numero: number; placa: string; marca_modelo: string | null; created_at: string; lote_id: string | null; lotes_importacao: { modo: string } | null; empresas_clientes: { nome_fantasia: string | null; razao_social: string } | null };
  const linhas = (await todasAsLinhas<Record<string, unknown>>((a, b) =>
    sb.from('ordens_servico').select('id, numero, placa, marca_modelo, created_at, lote_id, lotes_importacao(modo), empresas_clientes(nome_fantasia, razao_social)')
      .gte('created_at', `${hoje}T00:00:00-03:00`).order('created_at', { ascending: false }).range(a, b))) as unknown as Linha[];
  const novas = linhas.filter((o) => o.lotes_importacao?.modo !== 'historico');
  const porCliente = new Map<string, number>();
  for (const o of novas) {
    const c = o.empresas_clientes?.nome_fantasia || o.empresas_clientes?.razao_social || 'Sem cliente';
    porCliente.set(c, (porCliente.get(c) ?? 0) + 1);
  }
  return {
    hoje, total: novas.length, ultima: novas[0]?.created_at ?? null,
    lotes: new Set(novas.filter((o) => o.lote_id).map((o) => o.lote_id)).size,
    porCliente: [...porCliente].sort((a, b) => b[1] - a[1]),
    recentes: novas.slice(0, 6).map((o) => ({ numero: o.numero, placa: o.placa, modelo: o.marca_modelo, em: o.created_at })),
  };
}
