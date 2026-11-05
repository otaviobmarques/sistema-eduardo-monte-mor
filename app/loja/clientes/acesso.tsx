'use client';
import { useState, useTransition } from 'react';
import { Aviso, BotaoCopiar, Modal, Selo } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import { alterarBloqueio, gerarAcesso, resetarSenha } from './actions';
import { situacaoAcesso, type SituacaoAcesso } from '@/lib/acesso';

export function SeloAcesso({ s }: { s: SituacaoAcesso }) {
  const m = {
    sem_acesso: <Selo tom="neutro">Sem acesso</Selo>,
    aguardando: <Selo tom="atencao">◆ Aguardando 1º acesso</Selo>,
    expirada: <Selo tom="erro">■ Senha temporária expirada</Selo>,
    ativo: <Selo tom="ok">● Ativo</Selo>,
    bloqueado: <Selo tom="erro">■ Bloqueado</Selo>,
  };
  return m[s];
}

interface Perfil { login: string; nome_exibicao: string; bloqueado: boolean; deve_trocar_senha: boolean; senha_expira_em: string | null; primeiro_acesso_em: string | null }

type Cred = { login: string; senha: string; expira: string };
type Res<T = undefined> = { ok: boolean; erro?: string; dados?: T };
export interface AcoesAcesso {
  gerar: (login: string, nome: string) => Promise<Res<Cred>>;
  resetar: () => Promise<Res<Cred>>;
  bloquear: (bloquear: boolean) => Promise<Res>;
}

export function AcessoCliente({ empresaId, perfil, loginSugerido, responsavel, acoes, titulo = 'Acesso do cliente', descricao }: {
  empresaId: string; perfil: Perfil | null; loginSugerido: string; responsavel: string; acoes?: AcoesAcesso; titulo?: string; descricao?: string;
}) {
  const a: AcoesAcesso = acoes ?? {
    gerar: (l, n) => gerarAcesso(empresaId, l, n), resetar: () => resetarSenha(empresaId), bloquear: (b) => alterarBloqueio(empresaId, b),
  };
  const [login, setLogin] = useState(loginSugerido);
  const [nome, setNome] = useState(responsavel);
  const [credencial, setCredencial] = useState<{ login: string; senha: string; expira: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const sit = situacaoAcesso(perfil);

  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string; dados?: { login: string; senha: string; expira: string } }>) => {
    setErro(null);
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) setErro(r.erro ?? 'Não foi possível concluir.');
      else if (r.dados) setCredencial(r.dados);
    });
  };

  const texto = credencial ? `Sistema de OS – Auto Visão\nEndereço: ${typeof window !== 'undefined' ? window.location.origin : ''}/login\nUsuário: ${credencial.login}\nSenha temporária: ${credencial.senha}\nVálida até ${dataHora(credencial.expira)}. No primeiro acesso, crie uma nova senha.` : '';

  return (
    <section className="card space-y-4 p-6" aria-labelledby="acesso-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="acesso-titulo" className="h3">{titulo}</h2>
        <SeloAcesso s={sit} />
      </div>

      {!perfil ? (
        <>
          <p className="text-sm text-text-secondary">{descricao ?? 'Um login por empresa.'} A senha temporária aparece uma única vez, vale 7 dias e precisa ser trocada no primeiro acesso.</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="acesso-login" className="rotulo">Usuário</label>
              <input id="acesso-login" className="campo" value={login} autoCapitalize="none" onChange={(e) => setLogin(e.target.value.toLowerCase())} aria-describedby="acesso-login-ajuda" />
              <p id="acesso-login-ajuda" className="ajuda">Texto curto, ex.: creditas. Também pode ser um e-mail.</p>
            </div>
            <div>
              <label htmlFor="acesso-nome" className="rotulo">Nome exibido</label>
              <input id="acesso-nome" className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
              <p className="ajuda">Aparece no menu e no histórico.</p>
            </div>
          </div>
          <button type="button" className="btn btn-primario" disabled={pendente || !login} onClick={() => rodar(() => a.gerar(login, nome))}>
            {pendente ? 'Gerando…' : 'Gerar acesso'}
          </button>
        </>
      ) : (
        <>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="legenda">Usuário</dt><dd className="mt-1 font-semibold">{perfil.login}</dd></div>
            <div><dt className="legenda">Nome exibido</dt><dd className="mt-1">{perfil.nome_exibicao}</dd></div>
            <div>
              <dt className="legenda">{perfil.deve_trocar_senha ? 'Senha temporária válida até' : 'Primeiro acesso'}</dt>
              <dd className="mt-1">{perfil.deve_trocar_senha ? dataHora(perfil.senha_expira_em) : dataHora(perfil.primeiro_acesso_em)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-secundario" disabled={pendente}
              onClick={() => { if (confirm('Gerar uma nova senha temporária? A senha atual deixa de funcionar.')) rodar(() => a.resetar()); }}>
              Resetar senha
            </button>
            {perfil.bloqueado ? (
              <button type="button" className="btn btn-primario" disabled={pendente} onClick={() => rodar(() => a.bloquear(false))}>Desbloquear acesso</button>
            ) : (
              <button type="button" className="btn btn-texto" disabled={pendente}
                onClick={() => { if (confirm('Bloquear o acesso? O cliente sai do sistema imediatamente.')) rodar(() => a.bloquear(true)); }}>
                Bloquear acesso
              </button>
            )}
          </div>
        </>
      )}
      {erro && <Aviso tipo="erro" titulo="Não foi possível concluir">{erro}</Aviso>}

      <Modal aberto={credencial !== null} onFechar={() => setCredencial(null)} titulo="Acesso gerado" descricao="Copie agora: a senha não será mostrada de novo.">
        {credencial && (
          <div className="space-y-4">
            <dl className="space-y-3 rounded-card bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div><dt className="legenda">Usuário</dt><dd className="font-display text-xl font-extrabold">{credencial.login}</dd></div>
                <BotaoCopiar texto={credencial.login} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><dt className="legenda">Senha temporária</dt><dd className="font-mono text-xl font-bold tracking-wider">{credencial.senha}</dd></div>
                <BotaoCopiar texto={credencial.senha} />
              </div>
            </dl>
            <Aviso tipo="atencao" titulo="Senha temporária">
              Expira em {dataHora(credencial.expira)}. No primeiro acesso o cliente cria uma nova senha.
            </Aviso>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <BotaoCopiar texto={texto} rotulo="Copiar usuário e senha" />
              <button type="button" className="btn btn-primario" onClick={() => setCredencial(null)}>Já copiei</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
