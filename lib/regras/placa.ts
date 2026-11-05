export const PLACA_REGEX = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Remove espaços e hífen e converte para maiúsculas. */
export function normalizarPlaca(entrada: string | null | undefined): string {
  return (entrada ?? '').replace(/[\s-]/g, '').toUpperCase();
}

export function placaValida(placa: string): boolean {
  return PLACA_REGEX.test(normalizarPlaca(placa));
}

export function isMercosul(placa: string): boolean {
  const p = normalizarPlaca(placa);
  return PLACA_REGEX.test(p) && /[A-Z]/.test(p[4]);
}

/** Exibição: antigo "ABC-1234", Mercosul "ABC1D23". */
export function formatarPlaca(placa: string): string {
  const p = normalizarPlaca(placa);
  if (!PLACA_REGEX.test(p)) return p;
  return isMercosul(p) ? p : `${p.slice(0, 3)}-${p.slice(3)}`;
}
