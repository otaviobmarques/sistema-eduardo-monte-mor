import { describe, expect, it } from 'vitest';
import { limitesDoMes, mesAnterior, mesReferencia, mesSeguinte, nomeDoMes, totalizar, valorDaOs } from '@/lib/regras/financeiro';

describe('financeiro', () => {
  it('valor da OS usa o final congelado ou o previsto', () => {
    expect(valorDaOs({ valor_final: '180.00', valor_base: 150, valor_deslocamento: 50 })).toBe(180);
    expect(valorDaOs({ valor_final: null, valor_base: '150.00', valor_deslocamento: '30.50', valor_ajuste: '-10' })).toBe(170.5);
    expect(valorDaOs({ valor_final: 0, valor_base: 150 })).toBe(0);
  });
  it('mês de referência e limites em Brasília', () => {
    expect(mesReferencia('2026-10')).toBe('2026-10');
    expect(mesReferencia('2026-13', new Date('2026-11-01T02:00:00Z'))).toBe('2026-10'); // 23h de 31/10 em Brasília
    expect(limitesDoMes('2026-10')).toEqual({ inicio: '2026-10-01T03:00:00.000Z', fim: '2026-11-01T03:00:00.000Z' });
    expect(limitesDoMes('2026-12').fim).toBe('2027-01-01T03:00:00.000Z');
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSeguinte('2026-12')).toBe('2027-01');
    expect(nomeDoMes('2026-10')).toBe('outubro de 2026');
  });
  it('totaliza sem erro de arredondamento', () => {
    const t = totalizar([
      { valor: 0.1, pagamento_status: 'pago' }, { valor: 0.2, pagamento_status: 'pago' },
      { valor: 150, pagamento_status: 'pendente' }, { valor: 99.99, pagamento_status: 'faturado' },
    ]);
    expect(t).toMatchObject({ qtd: 4, pago: 0.3, pendente: 150, faturado: 99.99, total: 250.29, qtdPago: 2, qtdPendente: 1, qtdFaturado: 1 });
  });
});
