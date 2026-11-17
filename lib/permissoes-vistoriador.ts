/**
 * O que o vistoriador vê (Cadastros › Vistoriadores › “O que ele vê”). A regra vale no banco (minhas_vistorias()).
 * Nada financeiro (valor, pagamento) existe para o vistoriador, nem como opção (decidido em 17/11/2026).
 */
export const PERMISSOES_VISTORIADOR = [
  { chave: 'local', rotulo: 'Local da vistoria', ajuda: 'Pátio, endereço, cidade e o botão “Abrir no mapa”.' },
  { chave: 'cliente', rotulo: 'Cliente', ajuda: 'Nome do cliente e a unidade.' },
  { chave: 'observacao', rotulo: 'Observação da OS', ajuda: 'O recado do cliente (ex.: “chave na portaria”).' },
  { chave: 'prazo', rotulo: 'Prazo (SLA)', ajuda: 'Até quando a vistoria precisa ser feita.' },
  { chave: 'solicitante', rotulo: 'Solicitante e telefone', ajuda: 'Quem pediu a vistoria e o telefone de contato.' },
  { chave: 'renavam', rotulo: 'Renavam', ajuda: 'O Renavam do veículo.' },
  { chave: 'concluidas', rotulo: 'Vistorias feitas (últimos 7 dias)', ajuda: 'As que ele já concluiu na última semana.' },
  { chave: 'todas', rotulo: 'Todas as OS em aberto da Loja', ajuda: 'Além das dele, vê as outras placas a vistoriar (para se organizar por pátio).' },
] as const;
export type ChavePermissao = (typeof PERMISSOES_VISTORIADOR)[number]['chave'];
export type PermissoesVistoriador = Record<ChavePermissao, boolean>;
export const PERMISSOES_PADRAO: PermissoesVistoriador = { local: true, cliente: true, observacao: true, concluidas: true, prazo: false, solicitante: false, renavam: false, todas: false };
export function lerPermissoes(v: unknown): PermissoesVistoriador {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(PERMISSOES_VISTORIADOR.map((p) => [p.chave, typeof o[p.chave] === 'boolean' ? o[p.chave] : PERMISSOES_PADRAO[p.chave]])) as PermissoesVistoriador;
}
