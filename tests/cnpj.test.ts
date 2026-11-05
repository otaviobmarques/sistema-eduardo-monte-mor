import { describe, expect, it } from 'vitest';
import { cnpjValido, formatarCnpj, normalizarCnpj } from '@/lib/regras/cnpj';
import { parseMoeda, sugerirLogin } from '@/lib/formato';

describe('cnpj', () => {
  it('valida dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('123')).toBe(false);
  });
  it('normaliza e formata', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('moeda e login', () => {
  it('lê valores em reais', () => {
    expect(parseMoeda('1.234,56')).toBe(1234.56);
    expect(parseMoeda('R$ 150')).toBe(150);
    expect(parseMoeda('150.5')).toBe(150.5);
    expect(parseMoeda('')).toBeNull();
    expect(parseMoeda('abc')).toBeNull();
  });
  it('sugere login a partir do nome', () => {
    expect(sugerirLogin('Creditas Soluções Financeiras')).toBe('creditas');
    expect(sugerirLogin('Sao Leilões')).toBe('saoleiloes');
  });
});
