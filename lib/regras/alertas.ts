import type { SlaConfig, SlaResultado } from './sla';

export type TipoAlerta = 'alerta_24h' | 'faltam_8h' | 'vencida';

export interface FlagsAlerta { alerta1_enviado: boolean; alerta2_enviado: boolean; vencida_notificada: boolean }

/**
 * Decide quais alertas de SLA a OS deve disparar agora (seção 5.3).
 * - Pausada ou encerrada: nenhum.
 * - Se vários marcos foram cruzados de uma vez, envia só o mais grave e marca os anteriores
 *   como enviados (evita uma rajada de avisos atrasados).
 */
export function alertasDevidos(sla: SlaResultado, flags: FlagsAlerta, cfg: Pick<SlaConfig, 'alerta1_horas' | 'alerta2_horas_antes'>):
  { enviar: TipoAlerta | null; marcar: Partial<FlagsAlerta> } {
  if (sla.pausada || sla.cor === 'encerrada' || sla.cor === 'cinza') return { enviar: null, marcar: {} };
  const H = 3_600_000;
  const cruzou1 = sla.consumidoMs >= cfg.alerta1_horas * H;
  const cruzou2 = sla.restanteMs <= cfg.alerta2_horas_antes * H;
  const venceu = sla.restanteMs < 0;
  const marcar: Partial<FlagsAlerta> = {};
  let enviar: TipoAlerta | null = null;
  if (venceu && !flags.vencida_notificada) { enviar = 'vencida'; marcar.vencida_notificada = true; }
  if (cruzou2 && !flags.alerta2_enviado) { enviar ??= 'faltam_8h'; marcar.alerta2_enviado = true; }
  if (cruzou1 && !flags.alerta1_enviado) { enviar ??= 'alerta_24h'; marcar.alerta1_enviado = true; }
  return { enviar, marcar };
}

export function textoAlerta(tipo: TipoAlerta, placa: string, numero: number, cfg: Pick<SlaConfig, 'alerta1_horas' | 'alerta2_horas_antes'>, restante: string) {
  switch (tipo) {
    case 'alerta_24h': return { titulo: `SLA ${cfg.alerta1_horas}h · ${placa}`, corpo: `A OS ${numero} completou ${cfg.alerta1_horas}h. Vence em ${restante}.` };
    case 'faltam_8h': return { titulo: `Faltam ${restante} · ${placa}`, corpo: `A OS ${numero} vence em ${restante}.` };
    case 'vencida': return { titulo: `Vencida · ${placa}`, corpo: `A OS ${numero} passou do prazo do laudo.` };
  }
}
