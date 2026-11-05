import { describe, expect, it } from 'vitest';
import { loginParaEmail, gerarSenhaTemporaria, LOGIN_REGEX } from '@/lib/login';

describe('login', () => {
  it('usuário curto vira e-mail sintético', () => {
    expect(loginParaEmail(' Creditas ', 'x.app')).toBe('creditas@x.app');
    expect(loginParaEmail('Fulano@Empresa.com', 'x.app')).toBe('fulano@empresa.com');
  });
  it('valida formato do login', () => {
    expect(LOGIN_REGEX.test('creditas')).toBe(true);
    expect(LOGIN_REGEX.test('a b')).toBe(false);
    expect(LOGIN_REGEX.test('ab')).toBe(false);
  });
  it('senha temporária tem 12 caracteres, letra e dígito', () => {
    for (let i = 0; i < 50; i++) {
      const s = gerarSenhaTemporaria();
      expect(s).toHaveLength(12);
      expect(/[A-Za-z]/.test(s) && /[0-9]/.test(s)).toBe(true);
    }
  });
});
