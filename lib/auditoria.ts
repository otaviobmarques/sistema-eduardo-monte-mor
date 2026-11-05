/** Nomes legíveis dos campos para a trilha de auditoria. */
export const ROTULO_CAMPO: Record<string, string> = {
  '(criado)': 'Registro criado', '(excluído)': 'Registro excluído',
  status: 'Status', etapa: 'Etapa', vistoriador_id: 'Vistoriador', prazo_em: 'Prazo', pausado_desde: 'Pausado desde', total_pausado: 'Tempo pausado',
  marca_modelo: 'Marca e modelo', ano: 'Ano', cor: 'Cor', categoria_id: 'Categoria', renavam: 'Renavam', placa: 'Placa',
  valor_base: 'Valor base', valor_deslocamento: 'Deslocamento', valor_ajuste: 'Ajuste', valor_final: 'Valor final',
  pagamento_status: 'Pagamento', pagamento_forma: 'Forma de pagamento', pagamento_data: 'Data do pagamento',
  concluida_em: 'Concluída em', cancelada_em: 'Cancelada em', observacao: 'Observação', nome_solicitante: 'Solicitante',
  alerta1_enviado: '1º alerta enviado', alerta2_enviado: '2º alerta enviado', vencida_notificada: 'Vencimento notificado', escalonada: 'Escalonada',
  razao_social: 'Razão social', nome_fantasia: 'Nome fantasia', cnpj: 'CNPJ', forma_cobranca: 'Cobrança', usa_tabela_propria: 'Tabela própria',
  sla_horas: 'SLA (horas)', ativo: 'Ativo', valor: 'Valor', responsavel_financeiro: 'Responsável financeiro', responsavel_acesso: 'Responsável pelo acesso',
  'acesso gerado': 'Acesso gerado', 'senha resetada': 'Senha resetada', bloqueado: 'Bloqueado',
  data_hora: 'Data e hora', local_texto: 'Local', resolvida_em: 'Resolvida em', resolucao_texto: 'Resolução', previsao: 'Previsão', responsavel: 'Responsável',
};

export const ROTULO_TABELA: Record<string, string> = {
  ordens_servico: 'OS', pendencias: 'Pendência', os_agendamentos: 'Agendamento', empresas_clientes: 'Cliente',
  precos: 'Preço padrão', precos_cliente: 'Preço do cliente', perfis_usuario: 'Acesso',
};

/** Campos técnicos que poluem a leitura e não precisam aparecer por padrão. */
export const CAMPOS_TECNICOS = new Set(['id', 'created_at', 'created_by', 'empresa_cliente_id', 'servico_id', 'patio_id', 'lote_id', 'numero']);

export function valorLegivel(campo: string, v: string | null): string {
  if (v === null || v === '') return '—';
  if (v === 'true') return 'Sim';
  if (v === 'false') return 'Não';
  if (/_em$|^prazo_em$|^pausado_desde$|data_hora/.test(campo) && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date(v));
  }
  return v.length > 140 ? `${v.slice(0, 140)}…` : v;
}
