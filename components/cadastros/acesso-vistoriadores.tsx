'use client';
import { useState, useTransition } from 'react';
import { Aviso, BotaoCopiar, Modal, Selo } from '@/components/ui';
import { alterarSenhaVistoriador, bloquearVistoriador, criarAcessoVistoriador } from '@/app/loja/cadastros/vistoriadores/actions';
import { sugerirLogin, telefone as fmtTelefone } from '@/lib/formato';

export interface VistoriadorAcesso {
  id: string; nome: string; ativo: boolean; telefone: string | null;
  acesso: { login: string; bloqueado: boolean; primeiro_acesso_em: string | null } | null;
}

type Janela = { tipo: 'criar' | 'senha'; v: VistoriadorAcesso } | null;
type Envio = { v: VistoriadorAcesso; login: string; senha: string | null } | null;

function mensagem(nome: string, login: string, senha: string | null) {
  const link = `${window.location.origin}/login`;
  return [
    `Olá, ${nome.split(' ')[0]}! Este é o seu acesso ao Sistema de OS – Auto Visão, onde você vê as vistorias agendadas para você.`,
    `Link: ${link}`, `Usuário: ${login}`, senha ? `Senha: ${senha}` : 'Senha: a que a Loja passou para você.',
    'Dica: no celular, abra o link e use “Adicionar à tela de início” para ter o sistema como app.',
  ].join('\n');
}
function linkWhatsApp(tel: string | null, texto: string) {
  const num = (tel ?? '').replace(/\D/g, '');
  return `https://wa.me/${num ? `55${num}` : ''}?text=${encodeURIComponent(texto)}`;
}
function gerarSenha() {
  const letras = 'abcdefghjkmnpqrstuvwxyz', dig = '23456789';
  const r = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
  return Array.from({ length: 6 }, () => r(letras)).join('') + r(dig) + r(dig);
}

export function AcessoVistoriadores({ lista }: { lista: VistoriadorAcesso[] }) {
  const [janela, setJanela] = useState<Janela>(null);
  const [envio, setEnvio] = useState<Envio>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [pendente, iniciar] = useTransition();

  const abrir = (tipo: 'criar' | 'senha', v: VistoriadorAcesso) => { setErro(null); setCampos({}); setSenha(''); setMostrar(false); setJanela({ tipo, v }); };

  const salvar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!janela) return;
    const f = new FormData(e.currentTarget);
    const login = String(f.get('login') ?? '');
    iniciar(async () => {
      const r = janela.tipo === 'criar' ? await criarAcessoVistoriador(janela.v.id, login, senha) : await alterarSenhaVistoriador(janela.v.id, senha);
      if (!r.ok) { setErro(r.erro); setCampos(r.campos ?? {}); return; }
      setErro(null); setCampos({});
      setEnvio({ v: janela.v, login: r.dados!.login, senha });
      setJanela(null);
    });
  };

  const bloquear = (v: VistoriadorAcesso, b: boolean) => iniciar(async () => {
    const r = await bloquearVistoriador(v.id, b);
    if (!r.ok) setErro(r.erro);
  });

  return (
    <section className="mt-8" aria-labelledby="acesso-vist">
      <h2 id="acesso-vist" className="h3">Acesso dos vistoriadores</h2>
      <p className="mt-1 max-w-2xl text-text-secondary">Crie o usuário e a senha de cada vistoriador e envie o link do sistema pelo WhatsApp. Ele entra e vê só as vistorias designadas ou agendadas para ele.</p>
      {erro && !janela && <div className="mt-3"><Aviso tipo="erro" titulo="Não foi possível concluir">{erro}</Aviso></div>}
      <ul className="mt-4 divide-y divide-divider rounded-card border border-divider bg-white">
        {lista.length === 0 && <li className="p-4 text-text-secondary">Cadastre um vistoriador acima para criar o acesso dele.</li>}
        {lista.map((v) => (
          <li key={v.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between" data-teste={`acesso-${v.nome}`}>
            <div>
              <p className="font-semibold text-text">{v.nome} {!v.ativo && <span className="text-sm font-normal text-text-secondary">(inativo)</span>}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                {v.acesso ? (
                  <>
                    <Selo tom={v.acesso.bloqueado ? 'erro' : v.acesso.primeiro_acesso_em ? 'ok' : 'info'}>{v.acesso.bloqueado ? 'Bloqueado' : v.acesso.primeiro_acesso_em ? 'Ativo' : 'Aguardando 1º acesso'}</Selo>
                    <span>Usuário: <strong className="text-text">{v.acesso.login}</strong></span>
                  </>
                ) : <Selo tom="neutro">Sem acesso</Selo>}
                {v.telefone ? <span>· {fmtTelefone(v.telefone)}</span> : <span>· sem celular cadastrado</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!v.acesso && <button type="button" className="btn btn-primario btn-sm" disabled={!v.ativo || pendente} onClick={() => abrir('criar', v)}>Criar acesso</button>}
              {v.acesso && <>
                <button type="button" className="btn btn-secundario btn-sm" onClick={() => setEnvio({ v, login: v.acesso!.login, senha: null })}>Enviar link</button>
                <button type="button" className="btn btn-secundario btn-sm" disabled={pendente} onClick={() => abrir('senha', v)}>Alterar senha</button>
                <button type="button" className="btn btn-fantasma btn-sm" disabled={pendente} onClick={() => bloquear(v, !v.acesso!.bloqueado)}>{v.acesso.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
              </>}
            </div>
          </li>
        ))}
      </ul>

      <Modal aberto={!!janela} onFechar={() => setJanela(null)}
        titulo={janela?.tipo === 'criar' ? `Criar acesso · ${janela.v.nome}` : `Alterar senha · ${janela?.v.nome ?? ''}`}
        descricao={janela?.tipo === 'criar' ? 'Escolha o usuário e a senha. Depois você envia o link pelo WhatsApp.' : 'A senha antiga deixa de valer na hora.'}>
        {janela && (
          <form className="space-y-4" noValidate onSubmit={salvar}>
            {janela.tipo === 'criar' && (
              <div>
                <label htmlFor="vist-login" className="rotulo">Usuário</label>
                <input id="vist-login" name="login" className="campo" defaultValue={sugerirLogin(janela.v.nome)} autoCapitalize="none" autoComplete="off" required aria-invalid={!!campos.login} />
                <p className="ajuda">{campos.login ?? 'Letras minúsculas, números, ponto ou hífen (ex.: joao.silva).'}</p>
              </div>
            )}
            <div>
              <label htmlFor="vist-senha" className="rotulo">Senha</label>
              <div className="flex gap-2">
                <input id="vist-senha" name="senha" type={mostrar ? 'text' : 'password'} className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" required minLength={8} aria-invalid={!!campos.senha} />
                <button type="button" className="btn btn-secundario shrink-0" onClick={() => setMostrar((m) => !m)}>{mostrar ? 'Ocultar' : 'Mostrar'}</button>
              </div>
              <p className="ajuda">{campos.senha ?? 'Mínimo de 8 caracteres, com letras e números.'} <button type="button" className="font-semibold text-action underline" onClick={() => { setSenha(gerarSenha()); setMostrar(true); }}>Gerar uma senha</button></p>
            </div>
            {erro && <Aviso tipo="erro" titulo="Não foi possível salvar">{erro}</Aviso>}
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn btn-secundario" onClick={() => setJanela(null)}>Voltar</button>
              <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : janela.tipo === 'criar' ? 'Criar acesso' : 'Salvar nova senha'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={!!envio} onFechar={() => setEnvio(null)} titulo={envio?.senha ? 'Acesso pronto' : `Enviar link · ${envio?.v.nome ?? ''}`}
        descricao={envio?.senha ? 'Envie agora: por segurança, a senha não aparece de novo depois que esta janela fechar.' : 'A mensagem leva o link e o usuário. A senha não vai junto.'}>
        {envio && (() => {
          const texto = mensagem(envio.v.nome, envio.login, envio.senha);
          return (
            <div className="space-y-4">
              <pre className="whitespace-pre-wrap rounded-campo border border-divider bg-surface p-3 font-body text-sm text-text" data-teste="mensagem-vistoriador">{texto}</pre>
              {!envio.v.telefone && <p className="ajuda">Sem celular no cadastro: o WhatsApp abre para você escolher o contato. Cadastre o celular no vistoriador para ir direto.</p>}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <BotaoCopiar texto={texto} rotulo="Copiar mensagem" />
                <a className="btn btn-primario btn-sm" href={linkWhatsApp(envio.v.telefone, texto)} target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp</a>
              </div>
            </div>
          );
        })()}
      </Modal>
    </section>
  );
}
