/** Mensagens para os erros levantados pelas funções de operação no banco. */
const MSG: Record<string, string> = {
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  OS_NAO_ABERTA: 'Esta OS não está mais em andamento. Atualize a página.',
  OS_NAO_ENCONTRADA: 'OS não encontrada.',
  VISTORIADOR_INVALIDO: 'Escolha um vistoriador ativo.',
  MOTIVO_OBRIGATORIO: 'Escolha o motivo.',
  DESCRICAO_OBRIGATORIA: 'Descreva o que aconteceu.',
  DATA_INVALIDA: 'A data e hora não podem estar no futuro.',
  PREVISAO_OBRIGATORIA: 'Informe a previsão de resolução.',
  TEXTO_OBRIGATORIO: 'Escreva o texto antes de salvar.',
  PENDENCIA_RESOLVIDA: 'Esta pendência já foi resolvida.',
  SOLICITANTE_OBRIGATORIO: 'Informe o nome de quem pediu.',
  OS_NAO_PERMITE_LAUDO: 'Esta OS não aceita laudo agora (frustrada ou cancelada).',
  VERSAO_CONFLITO: 'Outra pessoa enviou um laudo agora mesmo. Atualize a página e tente de novo.',
  PENDENCIA_ABERTA: 'Resolva as pendências abertas antes de concluir a OS (com ou sem laudo).',
  JUSTIFICATIVA_OBRIGATORIA: 'A OS passou do prazo: justifique o atraso antes de concluir (com ou sem laudo).',
};

export function mensagemOperacao(erro: { message?: string } | null | undefined): string {
  const m = erro?.message ?? '';
  const k = Object.keys(MSG).find((x) => m.includes(x));
  return k ? MSG[k] : 'Não foi possível concluir. Tente de novo.';
}

export const TIPO_PENDENCIA_LABEL = {
  documental: 'Documental', falta_autorizacao: 'Falta de autorização', nao_localizado: 'Não localizado', agendamento: 'Agendamento', outra: 'Outra',
} as const;
