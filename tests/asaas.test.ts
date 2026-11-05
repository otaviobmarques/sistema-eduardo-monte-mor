import { describe, expect, it } from 'vitest';
import { proximoVencimento, statusFatura } from '@/lib/asaas';

describe('cobrança Asaas', () => {
  it('mapeia status do Asaas', () => {
    expect(statusFatura('PENDING')).toBe('pendente');
    expect(statusFatura('RECEIVED')).toBe('pago');
    expect(statusFatura('CONFIRMED')).toBe('pago');
    expect(statusFatura('RECEIVED_IN_CASH')).toBe('pago');
    expect(statusFatura('OVERDUE')).toBe('vencido');
    expect(statusFatura('REFUNDED')).toBe('cancelado');
    expect(statusFatura('PENDING', true)).toBe('cancelado');
  });
  it('calcula o próximo vencimento pelo dia da Loja', () => {
    expect(proximoVencimento(10, new Date('2026-11-05T12:00:00-03:00'))).toBe('2026-11-10');
    expect(proximoVencimento(5, new Date('2026-11-05T12:00:00-03:00'))).toBe('2026-12-05');
    expect(proximoVencimento(1, new Date('2026-12-20T12:00:00-03:00'))).toBe('2027-01-01');
  });
});
