/** Mensagens para os erros levantados pelas funções de operação no banco. */
const MSG: Record<string, string> = {
  SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
  OS_NAO_ABERTA: 'Esta OS não está mais em andamento. Atualize a página.',
  OS_NAO_ENCONTRADA: 'OS não encontrada.',
  OS_NAO_ENCERRADA: 'Só dá para reabrir OS vistoriada ou cancelada. Atualize a página.',
  DATA_CONCLUSAO_FUTURA: 'A data da conclusão não pode estar no futuro.',
  DATA_CONCLUSAO_ANTES_ABERTURA: 'A data da conclusão não pode ser anterior à abertura da OS.',
  DATA_ABERTURA_FUTURA: 'A data de abertura não pode estar no futuro.',
  DATA_ABERTURA_DEPOIS_CONCLUSAO: 'A abertura não pode ser depois da conclusão (ou do cancelamento) da OS.',
  DATA_ABERTURA_INVALIDA: 'Informe data e hora válidas.',
  VISTORIADOR_INVALIDO: 'Escolha um vistoriador ativo.',
  LOTE_VAZIO: 'Selecione pelo menos uma OS.',
  LOTE_GRANDE: 'Selecione no máximo 500 OS por vez.',
  JA_PAUSADA: 'O prazo desta OS já está pausado.',
  NAO_PAUSADA: 'O prazo desta OS não está pausado manualmente. Atualize a página.',
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
