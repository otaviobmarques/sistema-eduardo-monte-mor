export type SituacaoAcesso = 'sem_acesso' | 'aguardando' | 'expirada' | 'ativo' | 'bloqueado';

export function situacaoAcesso(p: { bloqueado: boolean; deve_trocar_senha: boolean; senha_expira_em: string | null } | null | undefined, agora = new Date()): SituacaoAcesso {
  if (!p) return 'sem_acesso';
  if (p.bloqueado) return 'bloqueado';
  if (p.deve_trocar_senha) return p.senha_expira_em && new Date(p.senha_expira_em) < agora ? 'expirada' : 'aguardando';
  return 'ativo';
}
