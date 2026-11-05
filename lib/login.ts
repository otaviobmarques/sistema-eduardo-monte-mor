/** Login por usuário: quando não é e-mail, vira um e-mail sintético interno no Supabase Auth. */
export function normalizarLogin(login: string): string {
  return login.trim().toLowerCase();
}

export function loginParaEmail(login: string, dominio = process.env.LOGIN_EMAIL_DOMAIN ?? 'login.autovisao.app'): string {
  const l = normalizarLogin(login);
  return l.includes('@') ? l : `${l}@${dominio}`;
}

export const LOGIN_REGEX = /^([a-z0-9._-]{3,40}|[^\s@]+@[^\s@]+\.[^\s@]+)$/;

/** Senha temporária legível (sem caracteres ambíguos), 12 caracteres. */
export function gerarSenhaTemporaria(rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digitos = '23456789';
  const todos = letras + digitos;
  const chars: string[] = [];
  chars.push(letras[rand(letras.length)], digitos[rand(digitos.length)]);
  while (chars.length < 12) chars.push(todos[rand(todos.length)]);
  // embaralha
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
