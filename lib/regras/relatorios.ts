/** Relatórios: agregação pura das linhas de vw_os_sla por dimensão (testada em tests/relatorios.test.ts). */

export interface LinhaRel {
  numero: number; placa: string; marca_modelo: string | null; cliente: string | null; status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado';
  aberta_em: string; concluida_em: string | null; prazo_em: string | null; cidade: string | null; uf: string | null; local_tipo: string | null;
  patio: string | null; vistoriador: string | null; valor: number | string | null; pagamento_status: 'pendente' | 'pago' | 'faturado';
  mes_abertura: string | null; no_prazo: boolean | null; horas_conclusao: number | string | null; horas_atraso: number | string | null;
  vencida_aberta: boolean | null; pausada: boolean | null; foi_frustrada: boolean | null; motivo_frustracao: string | null;
  motivo_atraso: string | null; motivo_cancelamento: string | null; unidade?: string | null;
}

export const TIPOS_RELATORIO = {
  periodo: { titulo: 'Por período', descricao: 'Volume e desempenho mês a mês.', dimensao: 'Mês', metrica: 'os', base: 'abertura' },
  cidade: { titulo: 'Por cidade', descricao: 'Onde as vistorias acontecem.', dimensao: 'Cidade', metrica: 'os', base: 'abertura' },
  patio: { titulo: 'Por pátio', descricao: 'Volume e prazo em cada pátio.', dimensao: 'Pátio', metrica: 'os', base: 'abertura' },
  vistoriador: { titulo: 'Por vistoriador', descricao: 'Produção e prazo de cada vistoriador.', dimensao: 'Vistoriador', metrica: 'os', base: 'abertura', soLoja: true },
  cliente: { titulo: 'Por cliente', descricao: 'Volume, prazo e valores por cliente.', dimensao: 'Cliente', metrica: 'os', base: 'abertura', soLoja: true },
  unidade: { titulo: 'Por unidade', descricao: 'Volume, prazo e valores por unidade do cliente (ex.: filiais do despachante).', dimensao: 'Unidade', metrica: 'os', base: 'abertura' },
  sla: { titulo: 'Desempenho de SLA', descricao: 'Concluídas no prazo, atrasadas e vencidas em aberto.', dimensao: 'Situação do prazo', metrica: 'os', base: 'abertura' },
  frustracoes: { titulo: 'Frustrados e cancelados', descricao: 'Motivos de frustração e de cancelamento.', dimensao: 'Motivo', metrica: 'os', base: 'abertura' },
  pagamentos: { titulo: 'Pagamentos', descricao: 'Pago, faturado e pendente das vistoriadas.', dimensao: 'Pagamento', metrica: 'valor', base: 'conclusao' },
  fechamento: { titulo: 'Fechamento mensal', descricao: 'Vistoriadas no período por cliente, com totais.', dimensao: 'Cliente', metrica: 'valor', base: 'conclusao' },
} as const;
export type TipoRelatorio = keyof typeof TIPOS_RELATORIO;

export function tipoValido(t: string | undefined, modo: 'loja' | 'cliente'): TipoRelatorio {
  const k = (t ?? '') as TipoRelatorio;
  if (k in TIPOS_RELATORIO && !(modo === 'cliente' && 'soLoja' in TIPOS_RELATORIO[k])) return k;
  return 'periodo';
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}`;

export const SITUACAO_SLA = ['Concluída no prazo', 'Concluída com atraso', 'Vencida em aberto', 'Em aberto no prazo', 'Pausada', 'Cancelada'] as const;
export function situacaoSla(l: LinhaRel): (typeof SITUACAO_SLA)[number] {
  if (l.status === 'cancelado') return 'Cancelada';
  if (l.status === 'vistoriado') return l.no_prazo ? 'Concluída no prazo' : 'Concluída com atraso';
  if (l.pausada) return 'Pausada';
  return l.vencida_aberta ? 'Vencida em aberto' : 'Em aberto no prazo';
}

const PAG = { pendente: 'Pendente', pago: 'Pago', faturado: 'Faturado' } as const;

/** Linhas que entram no relatório (alguns tipos olham só uma parte). */
export function filtrarParaTipo(tipo: TipoRelatorio, linhas: LinhaRel[]): LinhaRel[] {
  if (tipo === 'frustracoes') return linhas.filter((l) => l.foi_frustrada || l.status === 'cancelado');
  if (tipo === 'pagamentos' || tipo === 'fechamento') return linhas.filter((l) => l.status === 'vistoriado');
  return linhas;
}

/** Chave do grupo de cada linha, por tipo de relatório. */
export function chaves(tipo: TipoRelatorio, l: LinhaRel): string[] {
  switch (tipo) {
    case 'periodo': return [l.mes_abertura ?? '—'];
    case 'cidade': return [l.cidade ? `${l.cidade}${l.uf ? ` / ${l.uf}` : ''}` : 'Sem cidade'];
    case 'patio': return [l.patio ?? (l.local_tipo === 'endereco' ? 'Outro endereço' : 'Sem pátio')];
    case 'vistoriador': return [l.vistoriador ?? 'Sem vistoriador'];
    case 'cliente': case 'fechamento': return [l.cliente ?? '—'];
    case 'unidade': return [l.unidade?.trim() || 'Sem unidade'];
    case 'sla': return [situacaoSla(l)];
    case 'pagamentos': return [PAG[l.pagamento_status]];
    case 'frustracoes': {
      const k: string[] = [];
      if (l.foi_frustrada) k.push(`Frustração · ${l.motivo_frustracao ?? 'sem motivo'}`);
      if (l.status === 'cancelado') k.push(`Cancelamento · ${l.motivo_cancelamento ?? 'sem motivo'}`);
      return k;
    }
  }
}

export interface Agregado {
  total: number; vistoriadas: number; noPrazo: number; atrasadas: number; pctNoPrazo: number | null;
  tempoMedioHoras: number | null; frustradas: number; pctFrustradas: number | null; canceladas: number; pctCanceladas: number | null;
  valor: number; pendente: number; qtdPendente: number;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function agregar(linhas: LinhaRel[]): Agregado {
  let vist = 0, noPrazo = 0, horas = 0, nHoras = 0, frust = 0, canc = 0, valor = 0, pend = 0, qPend = 0;
  for (const l of linhas) {
    const v = Math.round(Number(l.valor ?? 0) * 100);
    if (l.status === 'vistoriado') {
      vist++; if (l.no_prazo) noPrazo++;
      if (l.horas_conclusao !== null && l.horas_conclusao !== undefined) { horas += Number(l.horas_conclusao); nHoras++; }
      if (l.pagamento_status === 'pendente') { pend += v; qPend++; }
    }
    if (l.foi_frustrada) frust++;
    if (l.status === 'cancelado') canc++; else valor += v;
  }
  return {
    total: linhas.length, vistoriadas: vist, noPrazo, atrasadas: vist - noPrazo, pctNoPrazo: pct(noPrazo, vist),
    tempoMedioHoras: nHoras ? Math.round((horas / nHoras) * 10) / 10 : null,
    frustradas: frust, pctFrustradas: pct(frust, linhas.length), canceladas: canc, pctCanceladas: pct(canc, linhas.length),
    valor: valor / 100, pendente: pend / 100, qtdPendente: qPend,
  };
}

export interface Grupo { chave: string; rotulo: string; a: Agregado }

/** Agrupa e ordena: período em ordem cronológica, SLA na ordem das situações, os demais pela métrica (maior primeiro). */
export function agrupar(tipo: TipoRelatorio, linhas: LinhaRel[]): Grupo[] {
  const mapa = new Map<string, LinhaRel[]>();
  for (const l of filtrarParaTipo(tipo, linhas)) for (const k of chaves(tipo, l)) mapa.set(k, [...(mapa.get(k) ?? []), l]);
  const grupos = [...mapa.entries()].map(([chave, ls]) => ({ chave, rotulo: tipo === 'periodo' && chave !== '—' ? rotuloMes(chave) : chave, a: agregar(ls) }));
  if (tipo === 'periodo') return grupos.sort((x, y) => x.chave.localeCompare(y.chave));
  if (tipo === 'sla') return grupos.sort((x, y) => SITUACAO_SLA.indexOf(x.chave as never) - SITUACAO_SLA.indexOf(y.chave as never));
  const m = TIPOS_RELATORIO[tipo].metrica === 'valor' ? (g: Grupo) => g.a.valor : (g: Grupo) => g.a.total;
  return grupos.sort((x, y) => m(y) - m(x) || x.rotulo.localeCompare(y.rotulo, 'pt-BR'));
}

export function valorMetrica(tipo: TipoRelatorio, g: Grupo): number {
  return TIPOS_RELATORIO[tipo].metrica === 'valor' ? g.a.valor : g.a.total;
}

/** "2026-10-01" válido ou o padrão. */
export function dataValida(v: string | undefined, padrao: string): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00-03:00`).getTime()) ? v : padrao;
}

/** Período padrão: do dia 1º do mês atual até hoje (Brasília). */
export function periodoPadrao(agora = new Date()): { de: string; ate: string } {
  const hoje = new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
}

/** Limites ISO (UTC) de um período em datas de Brasília, com o fim inclusivo. */
export function limitesPeriodo(de: string, ate: string): { inicio: string; fim: string } {
  const [a, b] = de <= ate ? [de, ate] : [ate, de];
  const fim = new Date(new Date(`${b}T00:00:00-03:00`).getTime() + 86_400_000);
  return { inicio: new Date(`${a}T00:00:00-03:00`).toISOString(), fim: fim.toISOString() };
}

export function formatarHoras(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  const d = Math.floor(h / 24), r = Math.round(h - d * 24);
  return d ? `${d}d ${r}h` : `${Math.round(h * 10) / 10}h`.replace('.', ',');
}
export const formatarPct = (p: number | null) => (p === null ? '—' : `${String(p).replace('.', ',')}%`);

/** Motivos da OS para relatórios; atrasada sem justificativa aparece como tal. */
export function motivosDaOs(l: Pick<LinhaRel, 'status' | 'no_prazo' | 'motivo_atraso' | 'motivo_frustracao' | 'motivo_cancelamento'>): string {
  const atraso = l.motivo_atraso ? `Atraso: ${l.motivo_atraso}` : l.status === 'vistoriado' && l.no_prazo === false ? 'Atraso: sem justificativa registrada' : null;
  return [atraso, l.motivo_frustracao && `Frustração: ${l.motivo_frustracao}`, l.motivo_cancelamento && `Cancelamento: ${l.motivo_cancelamento}`].filter(Boolean).join(' · ');
}
