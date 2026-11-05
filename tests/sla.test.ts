import { describe, expect, it } from 'vitest';
import { calcularSla, CONFIG_PADRAO, msUteisEntre, somarMsUteis, pesoUrgencia, type SlaConfig } from '@/lib/regras/sla';

const H = 3_600_000;
const aberta = new Date('2026-11-03T12:00:00-03:00'); // terça
const em = (h: number) => new Date(aberta.getTime() + h * H);
const base = { aberta_em: aberta, sla_horas: 48, status: 'a_vistoriar' as const };

describe('SLA horas corridas', () => {
  it('verde antes de 24h', () => {
    const r = calcularSla(base, CONFIG_PADRAO, em(10));
    expect(r.cor).toBe('verde');
    expect(r.prazo?.toISOString()).toBe(em(48).toISOString());
    expect(r.texto).toBe('Vence em 38h');
  });
  it('amarelo a partir de 24h', () => {
    expect(calcularSla(base, CONFIG_PADRAO, em(24)).cor).toBe('amarelo');
    expect(calcularSla(base, CONFIG_PADRAO, em(45)).texto).toBe('Vence em 3h');
  });
  it('vermelho depois do prazo', () => {
    const r = calcularSla(base, CONFIG_PADRAO, em(53));
    expect(r.cor).toBe('vermelho');
    expect(r.texto).toBe('+5h atrasada');
  });
  it('pausa congela o relógio e estende o prazo', () => {
    const os = { ...base, pausas: [{ inicio: em(20), fim: em(30) }] };
    const r = calcularSla(os, CONFIG_PADRAO, em(40));
    expect(r.consumidoMs).toBe(30 * H);
    expect(r.prazo?.toISOString()).toBe(em(58).toISOString());
    expect(r.cor).toBe('amarelo');
  });
  it('pausa aberta deixa cinza', () => {
    const os = { ...base, pausas: [{ inicio: em(20), fim: null }] };
    const r = calcularSla(os, CONFIG_PADRAO, em(70));
    expect(r.cor).toBe('cinza');
    expect(r.consumidoMs).toBe(20 * H);
    expect(r.texto).toBe('Pausado · 2d 2h');
  });
  it('pausas sobrepostas não contam duas vezes', () => {
    const os = { ...base, pausas: [{ inicio: em(10), fim: em(20) }, { inicio: em(15), fim: em(25) }] };
    expect(calcularSla(os, CONFIG_PADRAO, em(30)).pausadoMs).toBe(15 * H);
  });
  it('usa total_pausado e pausado_desde quando não há lista', () => {
    const r = calcularSla({ ...base, total_pausado_ms: 5 * H, pausado_desde: em(30) }, CONFIG_PADRAO, em(32));
    expect(r.cor).toBe('cinza');
    expect(r.consumidoMs).toBe(25 * H); // 32h - 5h pausadas antes - 2h da pausa atual
  });
  it('OS concluída no prazo e com atraso', () => {
    expect(calcularSla({ ...base, status: 'vistoriado', concluida_em: em(40) }, CONFIG_PADRAO, em(100)).noPrazo).toBe(true);
    const r = calcularSla({ ...base, status: 'vistoriado', concluida_em: em(50) }, CONFIG_PADRAO, em(100));
    expect(r.noPrazo).toBe(false);
    expect(r.cor).toBe('encerrada');
  });
  it('marcos de alerta', () => {
    const r = calcularSla(base, CONFIG_PADRAO, em(1));
    expect(r.marcoAlerta1?.toISOString()).toBe(em(24).toISOString());
    expect(r.marcoAlerta2?.toISOString()).toBe(em(40).toISOString());
  });
  it('ordena por urgência', () => {
    const v = calcularSla(base, CONFIG_PADRAO, em(50));
    const a = calcularSla(base, CONFIG_PADRAO, em(30));
    const g = calcularSla(base, CONFIG_PADRAO, em(1));
    const p = calcularSla({ ...base, pausas: [{ inicio: em(0), fim: null }] }, CONFIG_PADRAO, em(1));
    const ordem = [p, g, a, v].sort((x, y) => pesoUrgencia(x) - pesoUrgencia(y)).map((r) => r.cor);
    expect(ordem).toEqual(['vermelho', 'amarelo', 'verde', 'cinza']);
  });
});

describe('SLA horas úteis', () => {
  const cfg: SlaConfig = { ...CONFIG_PADRAO, contagem: 'uteis', feriados: ['2026-11-04'] };
  it('conta só dentro do horário útil e pula feriado', () => {
    // terça 12h → quinta 12h: terça 6h + quarta feriado 0 + quinta 4h = 10h
    const a = new Date('2026-11-03T12:00:00-03:00');
    const b = new Date('2026-11-05T12:00:00-03:00');
    expect(msUteisEntre(a, b, cfg)).toBe(10 * H);
  });
  it('soma horas úteis atravessando fim de semana', () => {
    // sexta 16h + 4h úteis = segunda 10h
    const r = somarMsUteis(new Date('2026-11-06T16:00:00-03:00'), 4 * H, cfg);
    expect(r.toISOString()).toBe(new Date('2026-11-09T10:00:00-03:00').toISOString());
  });
  it('prazo em horas úteis', () => {
    const r = calcularSla({ ...base, sla_horas: 10 }, cfg, new Date('2026-11-03T13:00:00-03:00'));
    expect(r.prazo?.toISOString()).toBe(new Date('2026-11-05T12:00:00-03:00').toISOString());
  });
});
