/** Endereço do logotipo do cliente (servido por /api/logo, com versão para trocar o cache quando muda). */
export function urlLogo(empresaId: string, path: string | null | undefined, atualizado: string | null | undefined) {
  return path ? `/api/logo/${empresaId}?v=${encodeURIComponent(atualizado ? String(Date.parse(atualizado)) : '1')}` : null;
}
