import { dataHora, moeda } from './formato';
import { formatarDuracao } from './regras/sla';

/** Nomes legíveis dos campos para a trilha de auditoria. */
export const ROTULO_CAMPO: Record<string, string> = {
  '(criado)': 'Registro criado', '(excluído)': 'Registro excluído',
  status: 'Status', etapa: 'Etapa', vistoriador_id: 'Vistoriador', prazo_em: 'Prazo', pausado_desde: 'Pausado desde', total_pausado: 'Tempo pausado',
  marca_modelo: 'Marca e modelo', ano: 'Ano', cor: 'Cor', categoria_id: 'Categoria', renavam: 'Renavam', placa: 'Placa',
  valor_base: 'Valor base', valor_deslocamento: 'Deslocamento', valor_ajuste: 'Ajuste', valor_final: 'Valor final',
  pagamento_status: 'Pagamento', pagamento_forma: 'Forma de pagamento', pagamento_data: 'Data do pagamento', pagamento_obs: 'Observação do pagamento',
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
export const CAMPOS_TECNICOS = new Set(['id', 'created_at', 'created_by', 'empresa_cliente_id', 'servico_id', 'patio_id', 'lote_id', 'numero', 'pagamento_registrado_em', 'pagamento_registrado_por']);

export function valorLegivel(campo: string, v: string | null): string {
  if (v === null || v === '') return '—';
  if (v === 'true') return 'Sim';
  if (v === 'false') return 'Não';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return dataHora(v);
  if (campo === 'total_pausado') {
    const dias = Number(v.match(/(\d+) days?/)?.[1] ?? 0);
    const t = v.match(/(\d+):(\d+):(\d+)/);
    if (t) return formatarDuracao((dias * 24 + Number(t[1])) * 3_600_000 + Number(t[2]) * 60_000);
  }
  if (/^valor/.test(campo) && /^-?\d+(\.\d+)?$/.test(v)) return moeda(v);
  return v.length > 140 ? `${v.slice(0, 140)}…` : v;
}
