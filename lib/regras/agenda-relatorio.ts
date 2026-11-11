/** Relatório da agenda: agregação pura dos agendamentos atuais por vistoriador, dia ou pátio (testada em tests/agenda-relatorio.test.ts). */

export interface LinhaAgenda {
  numero: number; placa: string; cliente: string | null; patio: string | null; local: string | null;
  data_hora: string; vistoriador: string | null; status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado';
}

export const SITUACOES_AGENDA = ['Realizada', 'Agendada', 'Não realizada', 'Frustrada', 'Cancelada'] as const;
export type SituacaoAgenda = (typeof SITUACOES_AGENDA)[number];

/** Situação de um agendamento: pela OS (vistoriada, frustrada, cancelada) ou pela hora (já passou e não foi feita). */
export function situacaoAgenda(l: Pick<LinhaAgenda, 'status' | 'data_hora'>, agora = new Date()): SituacaoAgenda {
  if (l.status === 'vistoriado') return 'Realizada';
  if (l.status === 'cancelado') return 'Cancelada';
  if (l.status === 'frustrado') return 'Frustrada';
  return new Date(l.data_hora).getTime() < agora.getTime() ? 'Não realizada' : 'Agendada';
}

export const AGRUPAR_AGENDA = { vistoriador: 'Vistoriador', dia: 'Dia', patio: 'Pátio' } as const;
export type AgruparAgenda = keyof typeof AGRUPAR_AGENDA;

export interface GrupoAgenda {
  chave: string; rotulo: string; total: number;
  realizadas: number; agendadas: number; naoRealizadas: number; frustradas: number; canceladas: number;
  pctRealizadas: number | null;
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** Dia em Brasília (aaaa-mm-dd) de um instante. */
export const diaBrasilia = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
export const rotuloDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} (${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]})`;

function vazio(chave: string, rotulo: string): GrupoAgenda {
  return { chave, rotulo, total: 0, realizadas: 0, agendadas: 0, naoRealizadas: 0, frustradas: 0, canceladas: 0, pctRealizadas: null };
}
function somar(g: GrupoAgenda, s: SituacaoAgenda) {
  g.total++;
  if (s === 'Realizada') g.realizadas++;
  else if (s === 'Agendada') g.agendadas++;
  else if (s === 'Não realizada') g.naoRealizadas++;
  else if (s === 'Frustrada') g.frustradas++;
  else g.canceladas++;
}
// % realizadas sobre as que já deviam ter acontecido (passadas), sem contar as canceladas
function fechar(g: GrupoAgenda) {
  const devidas = g.realizadas + g.naoRealizadas + g.frustradas;
  g.pctRealizadas = devidas ? Math.round((g.realizadas / devidas) * 1000) / 10 : null;
  return g;
}

export function totaisAgenda(linhas: LinhaAgenda[], agora = new Date()): GrupoAgenda {
  const g = vazio('total', 'Total');
  for (const l of linhas) somar(g, situacaoAgenda(l, agora));
  return fechar(g);
}

export function agruparAgenda(linhas: LinhaAgenda[], por: AgruparAgenda, agora = new Date()): GrupoAgenda[] {
  const grupos = new Map<string, GrupoAgenda>();
  for (const l of linhas) {
    const chave = por === 'dia' ? diaBrasilia(l.data_hora) : por === 'patio' ? (l.patio ?? 'Outro endereço') : (l.vistoriador ?? 'Sem vistoriador');
    const rotulo = por === 'dia' ? rotuloDia(chave) : chave;
    const g = grupos.get(chave) ?? vazio(chave, rotulo);
    somar(g, situacaoAgenda(l, agora));
    grupos.set(chave, g);
  }
  const lista = [...grupos.values()].map(fechar);
  return por === 'dia'
    ? lista.sort((a, b) => a.chave.localeCompare(b.chave))
    : lista.sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** Período padrão da agenda: o mês atual inteiro (Brasília), para incluir o que ainda está por vir. */
export function periodoAgendaPadrao(agora = new Date()): { de: string; ate: string } {
  const hoje = new Date(agora.getTime() - 3 * 3600_000);
  const a = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, '0');
  return { de: `${a}-${mm}-01`, ate: `${a}-${mm}-${String(ultimo).padStart(2, '0')}` };
}
