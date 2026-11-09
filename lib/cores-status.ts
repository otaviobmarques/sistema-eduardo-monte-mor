/** Cores que a Loja escolhe para cada status (5 opções, todas com contraste AA no selo). */
export const CORES = {
  amarelo: { rotulo: 'Amarelo', bg: '#FFF6DE', fg: '#805500' },
  roxo: { rotulo: 'Roxo', bg: '#F3EEFF', fg: '#5B2DA8' },
  vermelho: { rotulo: 'Vermelho', bg: '#FFF0ED', fg: '#B42318' },
  verde: { rotulo: 'Verde', bg: '#EDF8F0', fg: '#18743B' },
  azul: { rotulo: 'Azul', bg: '#EFF6FF', fg: '#165EA8' },
} as const;
export type CorStatus = keyof typeof CORES;
export const STATUS_COM_COR = ['a_vistoriar', 'frustrado', 'vistoriado', 'cancelado'] as const;
export type StatusComCor = (typeof STATUS_COM_COR)[number];
export const CORES_PADRAO: Record<StatusComCor, CorStatus> = { a_vistoriar: 'azul', frustrado: 'amarelo', vistoriado: 'verde', cancelado: 'vermelho' };

export function coresValidas(v: unknown): Record<StatusComCor, CorStatus> {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(STATUS_COM_COR.map((s) => [s, typeof o[s] === 'string' && o[s] as string in CORES ? o[s] : CORES_PADRAO[s]])) as Record<StatusComCor, CorStatus>;
}

/** Variáveis CSS usadas pelo selo de status (--st-<status>-bg / -fg). */
export function cssCoresStatus(cores: Record<StatusComCor, CorStatus>) {
  return `:root{${STATUS_COM_COR.map((s) => `--st-${s}-bg:${CORES[cores[s]].bg};--st-${s}-fg:${CORES[cores[s]].fg};`).join('')}}`;
}
