import { describe, expect, it } from 'vitest';
import { contarProducao, inicioBuscaProducao, periodosProducao } from '@/lib/regras/producao';

// Quinta, 12/11/2026 15:00 em Brasília
const agora = new Date('2026-11-12T18:00:00Z');
const br = (s: string) => new Date(`${s}-03:00`).toISOString();

describe('produção dos vistoriadores', () => {
  it('períodos em Brasília: hoje, semana (segunda), quinzena e mês', () => {
    const p = periodosProducao(agora);
    expect(p.dia.toISOString()).toBe(br('2026-11-12T00:00:00'));
    expect(p.semana.toISOString()).toBe(br('2026-11-09T00:00:00'));
    expect(p.quinzena.toISOString()).toBe(br('2026-11-01T00:00:00'));
    expect(p.mes.toISOString()).toBe(br('2026-11-01T00:00:00'));
    expect(p.rotulos).toEqual({ dia: '12/11', semana: 'desde 09/11', quinzena: '01 a 15/11', mes: '11/2026' });
    const q2 = periodosProducao(new Date('2026-11-20T12:00:00Z'));
    expect(q2.quinzena.toISOString()).toBe(br('2026-11-16T00:00:00'));
    expect(q2.rotulos.quinzena).toBe('16 a 30/11');
  });

  it('semana que começa no mês anterior: a busca começa na segunda', () => {
    const d = new Date('2026-12-02T12:00:00Z'); // quarta 02/12
    expect(periodosProducao(d).semana.toISOString()).toBe(br('2026-11-30T00:00:00'));
    expect(inicioBuscaProducao(d).toISOString()).toBe(br('2026-11-30T00:00:00'));
  });

  it('conta por vistoriador, “Sem vistoriador” por último e total', () => {
    const { linhas, total } = contarProducao([
      { vistoriador: 'Carlos', concluida_em: br('2026-11-12T09:00:00') }, // hoje
      { vistoriador: 'Carlos', concluida_em: br('2026-11-10T09:00:00') }, // semana
      { vistoriador: 'Carlos', concluida_em: br('2026-11-03T09:00:00') }, // quinzena/mês
      { vistoriador: 'Paula', concluida_em: br('2026-11-11T23:59:00') },  // semana (ontem)
      { vistoriador: null, concluida_em: br('2026-11-12T08:00:00') },
      { vistoriador: 'Carlos', concluida_em: br('2026-10-31T23:00:00') }, // mês anterior: fora
    ], agora);
    expect(linhas).toEqual([
      { vistoriador: 'Carlos', dia: 1, semana: 2, quinzena: 3, mes: 3 },
      { vistoriador: 'Paula', dia: 0, semana: 1, quinzena: 1, mes: 1 },
      { vistoriador: 'Sem vistoriador', dia: 1, semana: 1, quinzena: 1, mes: 1 },
    ]);
    expect(total).toEqual({ vistoriador: 'Total', dia: 2, semana: 4, quinzena: 5, mes: 5 });
  });
});
