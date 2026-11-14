import { describe, expect, it } from 'vitest';
import { calcularSla, type SlaConfig } from '@/lib/regras/sla';

const cfg: SlaConfig = { alerta1_horas: 24, alerta2_horas_antes: 8, contagem: 'uteis', horario_util: { dias: [1, 2, 3, 4, 5], inicio: '00:00', fim: '24:00' }, feriados: ['2026-11-20'] };
const br = (s: string) => new Date(`${s}-03:00`);

describe('SLA em dias úteis (sem sábado, domingo e feriados)', () => {
  it('sexta 08:00 + 48h → terça 08:00 (pula o fim de semana)', () => {
    const r = calcularSla({ aberta_em: br('2026-11-13T08:00:00'), sla_horas: 48, status: 'a_vistoriar' }, cfg, br('2026-11-13T09:00:00'));
    expect(r.prazo?.toISOString()).toBe(br('2026-11-17T08:00:00').toISOString());
  });
  it('feriado também não conta: quinta 19/11 10:00 + 48h → terça 24/11 10:00', () => {
    const r = calcularSla({ aberta_em: br('2026-11-19T10:00:00'), sla_horas: 48, status: 'a_vistoriar' }, cfg, br('2026-11-19T11:00:00'));
    expect(r.prazo?.toISOString()).toBe(br('2026-11-24T10:00:00').toISOString());
  });
  it('aberta no sábado começa a contar na segunda 00:00', () => {
    const r = calcularSla({ aberta_em: br('2026-11-14T15:00:00'), sla_horas: 48, status: 'a_vistoriar' }, cfg, br('2026-11-14T16:00:00'));
    expect(r.prazo?.toISOString()).toBe(br('2026-11-18T00:00:00').toISOString());
    expect(r.consumidoMs).toBe(0);
  });
});
