import { describe, expect, it } from 'vitest';
import { alertasDevidos } from '@/lib/regras/alertas';
import { calcularSla, CONFIG_PADRAO } from '@/lib/regras/sla';

const H = 3_600_000;
const aberta = new Date('2026-11-03T12:00:00-03:00');
const em = (h: number) => new Date(aberta.getTime() + h * H);
const os = { aberta_em: aberta, sla_horas: 48, status: 'a_vistoriar' as const };
const nada = { alerta1_enviado: false, alerta2_enviado: false, vencida_notificada: false };
const sla = (h: number, extra = {}) => calcularSla({ ...os, ...extra }, CONFIG_PADRAO, em(h));

describe('alertas de SLA', () => {
  it('nada antes de 24h', () => {
    expect(alertasDevidos(sla(23.9), nada, CONFIG_PADRAO)).toEqual({ enviar: null, marcar: {} });
  });
  it('24h dispara o primeiro alerta uma vez', () => {
    expect(alertasDevidos(sla(24), nada, CONFIG_PADRAO)).toEqual({ enviar: 'alerta_24h', marcar: { alerta1_enviado: true } });
    expect(alertasDevidos(sla(30), { ...nada, alerta1_enviado: true }, CONFIG_PADRAO).enviar).toBeNull();
  });
  it('faltando 8h dispara o segundo', () => {
    expect(alertasDevidos(sla(40), { ...nada, alerta1_enviado: true }, CONFIG_PADRAO)).toEqual({ enviar: 'faltam_8h', marcar: { alerta2_enviado: true } });
  });
  it('vencida dispara o último', () => {
    expect(alertasDevidos(sla(48.1), { alerta1_enviado: true, alerta2_enviado: true, vencida_notificada: false }, CONFIG_PADRAO).enviar).toBe('vencida');
  });
  it('vários marcos de uma vez: só o mais grave, todos marcados', () => {
    expect(alertasDevidos(sla(50), nada, CONFIG_PADRAO)).toEqual({ enviar: 'vencida', marcar: { vencida_notificada: true, alerta2_enviado: true, alerta1_enviado: true } });
  });
  it('pausada não alerta, mesmo vencida', () => {
    expect(alertasDevidos(sla(60, { pausas: [{ inicio: em(10), fim: null }] }), nada, CONFIG_PADRAO).enviar).toBeNull();
  });
  it('pausa adia os alertas', () => {
    const s = sla(30, { pausas: [{ inicio: em(10), fim: em(20) }] }); // consumido 20h
    expect(alertasDevidos(s, nada, CONFIG_PADRAO).enviar).toBeNull();
  });
  it('encerrada não alerta', () => {
    expect(alertasDevidos(sla(60, { status: 'vistoriado', concluida_em: em(50) }), nada, CONFIG_PADRAO).enviar).toBeNull();
  });
});
