/** Produção dos vistoriadores: vistorias feitas (OS vistoriadas, pela data da conclusão) hoje, na semana, na quinzena e no mês. */

export const PERIODOS_PRODUCAO = { dia: 'Hoje', semana: 'Semana', quinzena: 'Quinzena', mes: 'Mês' } as const;
export type PeriodoProducao = keyof typeof PERIODOS_PRODUCAO;

const TZ = 3 * 3600_000; // Brasília (UTC−3)
const inicioDoDia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d) + TZ); // 00:00 em Brasília

/** Início de cada período (Brasília): hoje; semana de segunda a domingo; quinzena 1–15 ou 16–fim do mês; mês. */
export function periodosProducao(agora = new Date()): Record<PeriodoProducao, Date> & { rotulos: Record<PeriodoProducao, string> } {
  const br = new Date(agora.getTime() - TZ);
  const a = br.getUTCFullYear(), m = br.getUTCMonth(), d = br.getUTCDate(), sem = br.getUTCDay();
  const dia = inicioDoDia(a, m, d);
  const semana = inicioDoDia(a, m, d - ((sem + 6) % 7));
  const quinzena = inicioDoDia(a, m, d <= 15 ? 1 : 16);
  const mes = inicioDoDia(a, m, 1);
  const f = (x: Date) => { const y = new Date(x.getTime() - TZ); return `${String(y.getUTCDate()).padStart(2, '0')}/${String(y.getUTCMonth() + 1).padStart(2, '0')}`; };
  const fimMes = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return {
    dia, semana, quinzena, mes,
    rotulos: {
      dia: f(dia), semana: `desde ${f(semana)}`,
      quinzena: d <= 15 ? `01 a 15/${String(m + 1).padStart(2, '0')}` : `16 a ${fimMes}/${String(m + 1).padStart(2, '0')}`,
      mes: `${String(m + 1).padStart(2, '0')}/${a}`,
    },
  };
}

export interface LinhaProducao { vistoriador: string; dia: number; semana: number; quinzena: number; mes: number }

/** Conta por vistoriador (OS sem vistoriador ficam em “Sem vistoriador”), do maior no mês para o menor. */
export function contarProducao(os: { vistoriador: string | null; concluida_em: string | null }[], agora = new Date()) {
  const p = periodosProducao(agora);
  const por = new Map<string, LinhaProducao>();
  const total: LinhaProducao = { vistoriador: 'Total', dia: 0, semana: 0, quinzena: 0, mes: 0 };
  for (const o of os) {
    if (!o.concluida_em) continue;
    const t = new Date(o.concluida_em).getTime();
    if (t > agora.getTime()) continue;
    const nome = o.vistoriador ?? 'Sem vistoriador';
    const l = por.get(nome) ?? { vistoriador: nome, dia: 0, semana: 0, quinzena: 0, mes: 0 };
    for (const k of Object.keys(PERIODOS_PRODUCAO) as PeriodoProducao[]) if (t >= p[k].getTime()) { l[k]++; total[k]++; }
    if (l.dia + l.semana + l.quinzena + l.mes > 0) por.set(nome, l);
  }
  const linhas = [...por.values()].sort((x, y) =>
    (x.vistoriador === 'Sem vistoriador' ? 1 : 0) - (y.vistoriador === 'Sem vistoriador' ? 1 : 0) || y.mes - x.mes || y.semana - x.semana || x.vistoriador.localeCompare(y.vistoriador, 'pt-BR'));
  return { linhas, total, periodos: p };
}

/** Desde quando buscar: o mais antigo entre o início da semana e o do mês. */
export const inicioBuscaProducao = (agora = new Date()) => { const p = periodosProducao(agora); return new Date(Math.min(p.semana.getTime(), p.mes.getTime())); };
