import { describe, expect, it } from 'vitest';
import { normalizarPlaca, placaValida, formatarPlaca, isMercosul } from '@/lib/regras/placa';
import { normalizarRenavam, renavamValido } from '@/lib/regras/renavam';

describe('placa', () => {
  it('normaliza espaços, hífen e minúsculas', () => {
    expect(normalizarPlaca(' eui-6776 ')).toBe('EUI6776');
    expect(normalizarPlaca('abc 1d23')).toBe('ABC1D23');
  });
  it('valida formato antigo e Mercosul', () => {
    expect(placaValida('eui6776')).toBe(true);
    expect(placaValida('ABC1D23')).toBe(true);
    expect(placaValida('AB12345')).toBe(false);
    expect(placaValida('ABCD123')).toBe(false);
    expect(placaValida('ABC12D3')).toBe(false);
    expect(placaValida('')).toBe(false);
  });
  it('formata para exibição', () => {
    expect(formatarPlaca('eui6776')).toBe('EUI-6776');
    expect(formatarPlaca('abc1d23')).toBe('ABC1D23');
    expect(isMercosul('ABC1D23')).toBe(true);
    expect(isMercosul('ABC1234')).toBe(false);
  });
});

describe('renavam', () => {
  it('preenche com zeros à esquerda', () => {
    expect(normalizarRenavam('123')).toBe('00000000123');
    expect(normalizarRenavam('6390.188.012-0')).toBe('63901880120');
  });
  it('valida o dígito verificador', () => {
    // 0063901880 → pesos 3,2,9,8,7,6,5,4,3,2
    expect(renavamValido('00639018807')).toBe(true);
    expect(renavamValido('00639018806')).toBe(false);
    expect(renavamValido('639018807')).toBe(true); // zeros à esquerda
    expect(renavamValido('')).toBe(false);
    expect(renavamValido('123456789012')).toBe(false);
  });
  it('dv 10 vira 0', () => {
    // procura um número cujo (soma*10)%11 == 10 e confere que dv 0 é aceito
    const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (let n = 1; n < 2000; n++) {
      const base = String(n).padStart(10, '0');
      const soma = pesos.reduce((a, p, i) => a + Number(base[i]) * p, 0);
      if ((soma * 10) % 11 === 10) {
        expect(renavamValido(base + '0')).toBe(true);
        return;
      }
    }
    throw new Error('não encontrou caso dv=10');
  });
});
