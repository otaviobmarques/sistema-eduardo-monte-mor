/**
 * Relógio do SLA (seção 5.3 do briefing).
 * prazo = aberta_em + sla + tempo pausado. A cor é calculada na leitura, nunca gravada.
 * Contagem "corridas" (padrão V1) ou "uteis" (horario_util + feriados).
 * Fuso: America/Sao_Paulo (UTC-3 fixo desde o fim do horário de verão em 2019).
 */

export type SlaCor = 'verde' | 'amarelo' | 'vermelho' | 'cinza' | 'encerrada';

export interface HorarioUtil {
  dias: number[]; // 0=domingo … 6=sábado
  inicio: string; // "08:00"
  fim: string; // "18:00"
}

export interface SlaConfig {
  alerta1_horas: number;
  alerta2_horas_antes: number;
  contagem: 'corridas' | 'uteis';
  horario_util: HorarioUtil;
  feriados?: string[]; // "2026-11-15"
}

export const CONFIG_PADRAO: SlaConfig = {
  alerta1_horas: 24,
  alerta2_horas_antes: 8,
  contagem: 'corridas',
  horario_util: { dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' },
  feriados: [],
};

export interface Pausa {
  inicio: Date | string;
  fim: Date | string | null;
}

export interface SlaEntrada {
  aberta_em: Date | string;
  sla_horas: number;
  status: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado';
  pausas?: Pausa[];
  /** usado quando a lista de pausas não está disponível (contagem corrida) */
  total_pausado_ms?: number;
  pausado_desde?: Date | string | null;
  concluida_em?: Date | string | null;
  cancelada_em?: Date | string | null;
}

export interface SlaResultado {
  cor: SlaCor;
  pausada: boolean;
  prazo: Date | null; // null quando pausada em contagem útil e indeterminável
  consumidoMs: number;
  restanteMs: number; // negativo = atrasada
  pausadoMs: number;
  marcoAlerta1: Date | null;
  marcoAlerta2: Date | null;
  noPrazo: boolean | null; // para OS encerradas
  texto: string;
}

const H = 3_600_000;
const OFFSET_SP = -3 * H;

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

/* ───────── horas úteis ───────── */

function minutos(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Retorna os intervalos úteis [ini, fim) (em ms UTC) do dia local que contém `t`. */
function janelaDoDia(diaLocalMs: number, cfg: SlaConfig): [number, number] | null {
  const d = new Date(diaLocalMs);
  const iso = d.toISOString().slice(0, 10);
  if (!cfg.horario_util.dias.includes(d.getUTCDay())) return null;
  if (cfg.feriados?.includes(iso)) return null;
  const base = diaLocalMs - OFFSET_SP; // meia-noite local em UTC
  return [base + minutos(cfg.horario_util.inicio) * 60_000, base + minutos(cfg.horario_util.fim) * 60_000];
}

function inicioDiaLocal(utcMs: number) {
  const local = utcMs + OFFSET_SP;
  return local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
}

/** Milissegundos úteis entre a e b. */
export function msUteisEntre(a: Date, b: Date, cfg: SlaConfig): number {
  let ini = a.getTime();
  const fim = b.getTime();
  if (fim <= ini) return 0;
  let total = 0;
  let dia = inicioDiaLocal(ini);
  while (dia - OFFSET_SP < fim) {
    const j = janelaDoDia(dia, cfg);
    if (j) {
      const s = Math.max(j[0], ini);
      const e = Math.min(j[1], fim);
      if (e > s) total += e - s;
    }
    dia += 86_400_000;
    if (total > 0 && dia - OFFSET_SP > fim) break;
  }
  return total;
}

/** Soma `ms` úteis a partir de `inicio`. */
export function somarMsUteis(inicio: Date, ms: number, cfg: SlaConfig): Date {
  let resta = ms;
  let t = inicio.getTime();
  let dia = inicioDiaLocal(t);
  for (let guard = 0; guard < 3650; guard++) {
    const j = janelaDoDia(dia, cfg);
    if (j) {
      const s = Math.max(j[0], t);
      if (s < j[1]) {
        const disponivel = j[1] - s;
        if (resta <= disponivel) return new Date(s + resta);
        resta -= disponivel;
      }
    }
    dia += 86_400_000;
    t = dia - OFFSET_SP;
  }
  throw new Error('horario_util sem dias úteis');
}

/* ───────── cálculo principal ───────── */

function medir(a: Date, b: Date, cfg: SlaConfig) {
  return cfg.contagem === 'uteis' ? msUteisEntre(a, b, cfg) : Math.max(0, b.getTime() - a.getTime());
}

export function formatarDuracao(ms: number): string {
  const abs = Math.abs(ms);
  const h = Math.floor(abs / H);
  const m = Math.floor((abs % H) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h >= 1) return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
  return `${m}min`;
}

export function calcularSla(os: SlaEntrada, cfg: SlaConfig = CONFIG_PADRAO, agora: Date = new Date()): SlaResultado {
  const aberta = toDate(os.aberta_em);
  const slaMs = os.sla_horas * H;
  const encerradaEm =
    os.status === 'vistoriado' && os.concluida_em
      ? toDate(os.concluida_em)
      : os.status === 'cancelado' && os.cancelada_em
        ? toDate(os.cancelada_em)
        : null;
  const ref = encerradaEm ?? agora;

  // tempo pausado
  let pausadoMs = 0;
  let pausadaDesde = null as Date | null;
  if (os.pausas) {
    for (const p of os.pausas) {
      const ini = toDate(p.inicio);
      const fim = p.fim ? toDate(p.fim) : null;
      if (!fim) pausadaDesde = pausadaDesde && pausadaDesde < ini ? pausadaDesde : ini;
    }
    // une intervalos sobrepostos para não contar duas vezes
    const ints = os.pausas
      .map((p) => [toDate(p.inicio).getTime(), p.fim ? toDate(p.fim).getTime() : ref.getTime()] as [number, number])
      .map(([s, e]) => [s, Math.min(e, ref.getTime())] as [number, number])
      .filter(([s, e]) => e > s)
      .sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const i of ints) {
      const last = merged[merged.length - 1];
      if (last && i[0] <= last[1]) last[1] = Math.max(last[1], i[1]);
      else merged.push([...i]);
    }
    pausadoMs = merged.reduce((acc, [s, e]) => acc + medir(new Date(s), new Date(e), cfg), 0);
  } else {
    pausadoMs = os.total_pausado_ms ?? 0;
    if (os.pausado_desde) {
      pausadaDesde = toDate(os.pausado_desde);
      pausadoMs += medir(pausadaDesde, ref, cfg);
    }
  }

  const pausada = !encerradaEm && pausadaDesde !== null;
  const consumidoMs = Math.max(0, medir(aberta, ref, cfg) - pausadoMs);
  const restanteMs = slaMs - consumidoMs;

  // prazo absoluto: projeta o restante a partir da referência (pausa congela)
  const projetar = (base: Date, ms: number) =>
    cfg.contagem === 'uteis' ? somarMsUteis(base, ms, cfg) : new Date(base.getTime() + ms);
  const prazo = pausada ? null : restanteMs >= 0 ? projetar(ref, restanteMs) : new Date(ref.getTime() + restanteMs);
  const a1 = cfg.alerta1_horas * H;
  const a2 = slaMs - cfg.alerta2_horas_antes * H;
  const marcoAlerta1 = pausada ? null : consumidoMs < a1 ? projetar(ref, a1 - consumidoMs) : null;
  const marcoAlerta2 = pausada ? null : consumidoMs < a2 ? projetar(ref, a2 - consumidoMs) : null;

  if (encerradaEm) {
    const noPrazo = restanteMs >= 0;
    return {
      cor: 'encerrada', pausada: false, prazo, consumidoMs, restanteMs, pausadoMs,
      marcoAlerta1, marcoAlerta2, noPrazo,
      texto: os.status === 'cancelado' ? 'Cancelada' : noPrazo ? 'Concluída no prazo' : `Concluída com ${formatarDuracao(-restanteMs)} de atraso`,
    };
  }

  let cor: SlaCor;
  let texto: string;
  if (pausada) {
    cor = 'cinza';
    texto = `Pausado · ${formatarDuracao(agora.getTime() - pausadaDesde!.getTime())}`;
  } else if (restanteMs < 0) {
    cor = 'vermelho';
    texto = `+${formatarDuracao(-restanteMs)} atrasada`;
  } else if (consumidoMs >= a1) {
    cor = 'amarelo';
    texto = `Vence em ${formatarDuracao(restanteMs)}`;
  } else {
    cor = 'verde';
    texto = `Vence em ${formatarDuracao(restanteMs)}`;
  }
  return { cor, pausada, prazo, consumidoMs, restanteMs, pausadoMs, marcoAlerta1, marcoAlerta2, noPrazo: null, texto };
}

/** Ordenação por urgência: vencidas, depois vencendo, depois restante; pausadas por último. */
export function pesoUrgencia(r: SlaResultado): number {
  const grupo = { vermelho: 0, amarelo: 1, verde: 2, cinza: 3, encerrada: 4 }[r.cor];
  return grupo * 1e13 + r.restanteMs;
}
