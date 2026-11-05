import { describe, expect, it } from 'vitest';
import { agregar, agrupar, formatarHoras, formatarPct, limitesPeriodo, rotuloMes, situacaoSla, tipoValido, type LinhaRel } from '@/lib/regras/relatorios';

const base: LinhaRel = {
  numero: 1, placa: 'ABC1D23', marca_modelo: null, cliente: 'Creditas', status: 'vistoriado', aberta_em: '2026-10-01T12:00:00Z', concluida_em: '2026-10-02T12:00:00Z',
  prazo_em: '2026-10-03T12:00:00Z', cidade: 'Santo André', uf: 'SP', local_tipo: 'patio', patio: 'Freitas Utinga', vistoriador: 'João', valor: '150.00',
  pagamento_status: 'pendente', mes_abertura: '2026-10-01', no_prazo: true, horas_conclusao: '24', horas_atraso: null, vencida_aberta: false, pausada: false,
  foi_frustrada: false, motivo_frustracao: null, motivo_atraso: null, motivo_cancelamento: null,
};
const l = (o: Partial<LinhaRel>): LinhaRel => ({ ...base, ...o });

describe('relatórios', () => {
  const linhas = [
    l({}), l({ no_prazo: false, horas_conclusao: 60, horas_atraso: 12, pagamento_status: 'pago', cidade: 'São Carlos', patio: 'Leilo São Carlos' }),
    l({ status: 'a_vistoriar', concluida_em: null, no_prazo: null, horas_conclusao: null, vencida_aberta: true, mes_abertura: '2026-11-01' }),
    l({ status: 'frustrado', concluida_em: null, no_prazo: null, horas_conclusao: null, foi_frustrada: true, motivo_frustracao: 'Veículo não localizado' }),
    l({ status: 'cancelado', concluida_em: null, no_prazo: null, horas_conclusao: null, motivo_cancelamento: 'Duplicidade', valor: 150 }),
  ];
  it('agrega KPIs', () => {
    expect(agregar(linhas)).toMatchObject({ total: 5, vistoriadas: 2, noPrazo: 1, atrasadas: 1, pctNoPrazo: 50, tempoMedioHoras: 42, frustradas: 1, pctFrustradas: 20, canceladas: 1, pctCanceladas: 20, valor: 600, pendente: 150, qtdPendente: 1 });
    expect(agregar([]).pctNoPrazo).toBeNull();
  });
  it('agrupa por dimensão e ordena', () => {
    expect(agrupar('periodo', linhas).map((g) => [g.rotulo, g.a.total])).toEqual([['out/2026', 4], ['nov/2026', 1]]);
    expect(agrupar('cidade', linhas)[0]).toMatchObject({ rotulo: 'Santo André / SP', a: { total: 4 } });
    expect(agrupar('sla', linhas).map((g) => g.chave)).toEqual(['Concluída no prazo', 'Concluída com atraso', 'Vencida em aberto', 'Em aberto no prazo', 'Cancelada']);
    expect(agrupar('frustracoes', linhas).map((g) => g.chave).sort()).toEqual(['Cancelamento · Duplicidade', 'Frustração · Veículo não localizado']);
    expect(agrupar('pagamentos', linhas).map((g) => [g.chave, g.a.valor])).toEqual([['Pago', 150], ['Pendente', 150]]);
  });
  it('situação de SLA', () => {
    expect(situacaoSla(l({ status: 'a_vistoriar', pausada: true }))).toBe('Pausada');
    expect(situacaoSla(l({ no_prazo: false }))).toBe('Concluída com atraso');
  });
  it('período em Brasília com fim inclusivo e formatos', () => {
    expect(limitesPeriodo('2026-10-01', '2026-10-31')).toEqual({ inicio: '2026-10-01T03:00:00.000Z', fim: '2026-11-01T03:00:00.000Z' });
    expect(limitesPeriodo('2026-10-31', '2026-10-01').inicio).toBe('2026-10-01T03:00:00.000Z');
    expect(rotuloMes('2026-03-01')).toBe('mar/2026');
    expect(formatarHoras(0.5)).toBe('30 min'); expect(formatarHoras(30.4)).toBe('1d 6h'); expect(formatarHoras(5.25)).toBe('5,3h');
    expect(formatarPct(97.5)).toBe('97,5%');
    expect(tipoValido('vistoriador', 'cliente')).toBe('periodo'); expect(tipoValido('sla', 'cliente')).toBe('sla');
  });
});
