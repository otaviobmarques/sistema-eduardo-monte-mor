import { describe, expect, it } from 'vitest';
import { agruparAgenda, periodoAgendaPadrao, situacaoAgenda, totaisAgenda, type LinhaAgenda } from '@/lib/regras/agenda-relatorio';

const agora = new Date('2026-11-12T15:00:00Z'); // 12/11 12:00 em Brasília
const l = (p: Partial<LinhaAgenda>): LinhaAgenda => ({ numero: 1, placa: 'ABC1D23', cliente: 'C', patio: 'Pátio A', local: null, data_hora: '2026-11-12T11:00:00Z', vistoriador: 'Carlos', status: 'a_vistoriar', ...p });

describe('relatório da agenda', () => {
  it('situação pelo status da OS ou pela hora', () => {
    expect(situacaoAgenda(l({ status: 'vistoriado' }), agora)).toBe('Realizada');
    expect(situacaoAgenda(l({ status: 'cancelado' }), agora)).toBe('Cancelada');
    expect(situacaoAgenda(l({ status: 'frustrado' }), agora)).toBe('Frustrada');
    expect(situacaoAgenda(l({ data_hora: '2026-11-12T11:00:00Z' }), agora)).toBe('Não realizada');
    expect(situacaoAgenda(l({ data_hora: '2026-11-13T11:00:00Z' }), agora)).toBe('Agendada');
  });

  it('agrupa por vistoriador (maior primeiro) com % realizadas sobre as que já passaram', () => {
    const linhas = [
      l({ vistoriador: 'Carlos', status: 'vistoriado' }), l({ vistoriador: 'Carlos', status: 'vistoriado' }), l({ vistoriador: 'Carlos' }),
      l({ vistoriador: 'Carlos', data_hora: '2026-11-14T11:00:00Z' }), l({ vistoriador: 'Paula', status: 'cancelado' }),
    ];
    const [c, p] = agruparAgenda(linhas, 'vistoriador', agora);
    expect(c).toMatchObject({ rotulo: 'Carlos', total: 4, realizadas: 2, naoRealizadas: 1, agendadas: 1, pctRealizadas: 66.7 });
    expect(p).toMatchObject({ rotulo: 'Paula', total: 1, canceladas: 1, pctRealizadas: null });
    expect(totaisAgenda(linhas, agora)).toMatchObject({ total: 5, realizadas: 2, agendadas: 1, naoRealizadas: 1, canceladas: 1 });
  });

  it('agrupa por dia em ordem de data (Brasília) e por pátio', () => {
    const linhas = [l({ data_hora: '2026-11-14T02:30:00Z' }), l({ data_hora: '2026-11-12T11:00:00Z', patio: null }), l({ data_hora: '2026-11-13T23:00:00Z' })];
    expect(agruparAgenda(linhas, 'dia', agora).map((g) => [g.chave, g.total])).toEqual([['2026-11-12', 1], ['2026-11-13', 2]]);
    expect(agruparAgenda(linhas, 'dia', agora)[0].rotulo).toBe('12/11/2026 (qui)');
    expect(agruparAgenda(linhas, 'patio', agora).map((g) => g.rotulo)).toEqual(['Pátio A', 'Outro endereço']);
  });

  it('período padrão = mês atual inteiro', () => {
    expect(periodoAgendaPadrao(agora)).toEqual({ de: '2026-11-01', ate: '2026-11-30' });
    expect(periodoAgendaPadrao(new Date('2026-02-10T12:00:00Z'))).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
  });
});
