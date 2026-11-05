const PESOS = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** Só dígitos, com zeros à esquerda até 11. */
export function normalizarRenavam(entrada: string | number | null | undefined): string {
  const d = String(entrada ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.padStart(11, '0');
}

export function renavamValido(entrada: string | number | null | undefined): boolean {
  const r = normalizarRenavam(entrada);
  if (r.length !== 11) return false;
  const soma = PESOS.reduce((acc, peso, i) => acc + Number(r[i]) * peso, 0);
  let dv = (soma * 10) % 11;
  if (dv === 10) dv = 0;
  return dv === Number(r[10]);
}
