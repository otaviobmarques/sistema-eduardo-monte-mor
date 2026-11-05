'use client';
import { useState, useTransition } from 'react';
import { Aviso, BotaoCopiar, Selo } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import { configurarWebhook, removerChaveGateway, salvarChaveGateway, salvarFormaPagamento, usarAmbienteGateway } from '../actions';
import { FORMAS_ASAAS, type FormaAsaas } from '@/lib/asaas-formas';

export type Ambiente = 'sandbox' | 'producao';
export interface EstadoAmbiente {
  ambiente: Ambiente; chaveFinal: string | null; testadoEm: string | null; testeOk: boolean | null; testeMensagem: string | null;
  webhookUrl: string | null; viaAmbiente: boolean;
}
const INFO: Record<Ambiente, { nome: string; titulo: string; conta: string; descricao: string }> = {
  sandbox: { nome: 'Teste', titulo: 'Teste (sandbox)', conta: 'sandbox.asaas.com', descricao: 'Cobranças de mentira, para validar o fluxo. Não bloqueiam Lojas e o Gestor não vê.' },
  producao: { nome: 'Produção', titulo: 'Produção', conta: 'asaas.com', descricao: 'Cobranças reais, enviadas às Lojas com Pix, boleto e cartão.' },
};

function SituacaoChave({ e }: { e: EstadoAmbiente }) {
  if (!e.chaveFinal && !e.viaAmbiente) return <Selo tom="neutro">Sem chave</Selo>;
  if (e.testeOk === false) return <Selo tom="erro">■ Chave com erro</Selo>;
  if (e.testeOk) return <Selo tom="ok">● Chave testada</Selo>;
  return <Selo tom="atencao">◆ Chave não testada</Selo>;
}

/** Seletor do ambiente em uso: vale para as cobranças novas; o outro ambiente continua salvo. */
export function SeletorAmbiente({ emUso, ativo, ambientes }: { emUso: Ambiente; ativo: boolean; ambientes: EstadoAmbiente[] }) {
  const [sel, setSel] = useState<Ambiente>(emUso);
  const [ligado, setLigado] = useState(ativo);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const temChave = (a: Ambiente) => { const e = ambientes.find((x) => x.ambiente === a); return !!(e?.chaveFinal || e?.viaAmbiente); };
  const mudou = sel !== emUso || ligado !== ativo;
  return (
    <section className="card space-y-5 p-6" aria-labelledby="gw-uso">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gw-uso" className="h3">Ambiente em uso</h2>
          <p className="text-sm text-text-secondary">Escolha qual conta do Asaas gera as cobranças novas. A configuração do outro ambiente continua salva.</p>
        </div>
        {ativo ? <Selo tom={emUso === 'producao' ? 'ok' : 'info'}>● Cobrando pelo Asaas {INFO[emUso].nome}</Selo> : <Selo tom="neutro">Asaas desligado · faturas manuais</Selo>}
      </div>
      <form className="space-y-4" noValidate onSubmit={(ev) => {
        ev.preventDefault(); setMsg(null);
        iniciar(async () => { const r = await usarAmbienteGateway(sel, ligado); setMsg(r.ok ? { ok: true, t: r.dados!.mensagem } : { ok: false, t: r.erro }); });
      }}>
        <fieldset>
          <legend className="sr-only">Ambiente</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['sandbox', 'producao'] as const).map((a) => (
              <label key={a} className="flex min-h-toque cursor-pointer gap-3 rounded-card border-[1.5px] border-border p-4 has-[:checked]:border-impact has-[:checked]:bg-surface">
                <input type="radio" name="gw-ambiente" value={a} className="mt-1 accent-action" checked={sel === a} onChange={() => { setSel(a); setMsg(null); }} />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{INFO[a].titulo}</span>{emUso === a && ativo && <Selo tom="ok">Em uso</Selo>}</span>
                  <span className="mt-1 block text-sm text-text-secondary">{INFO[a].descricao}</span>
                  <span className="mt-2 block"><SituacaoChave e={ambientes.find((x) => x.ambiente === a)!} /></span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-toque items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="check" checked={ligado} onChange={(ev) => { setLigado(ev.target.checked); setMsg(null); }} />Usar o Asaas para cobrar as Lojas
        </label>
        {ligado && !temChave(sel) && <Aviso tipo="atencao" titulo={`O ambiente ${INFO[sel].nome} está sem chave`}>Cadastre e teste a chave dele no cartão abaixo antes de usá-lo para cobrar.</Aviso>}
        {ligado && sel === 'producao' && emUso !== 'producao' && temChave('producao') && <Aviso tipo="info" titulo="Passando a cobrar de verdade">A partir de agora, “Ativar cobrança” e “Nova fatura” geram cobranças reais. As faturas de teste continuam na lista, marcadas como Teste.</Aviso>}
        {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível salvar'}>{msg.t}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primario" disabled={pendente || !mudou || (ligado && !temChave(sel))} aria-describedby="gw-uso-motivo">{pendente ? 'Salvando…' : 'Salvar seleção'}</button>
          <p id="gw-uso-motivo" className="text-sm text-text-secondary" aria-live="polite">
            {!mudou ? `Esta já é a seleção em uso (${ativo ? `Asaas ${INFO[emUso].nome} ligado` : 'Asaas desligado'}). Mude o ambiente ou a caixa acima para salvar.`
              : ligado && !temChave(sel) ? `Cadastre a chave do ambiente ${INFO[sel].nome} para poder ligá-lo.`
              : `Ao salvar: ${ligado ? `cobranças novas pelo Asaas ${INFO[sel].nome}` : 'Asaas desligado, cobranças manuais'}.`}
          </p>
        </div>
      </form>
    </section>
  );
}

/** Configuração de UM ambiente: chave (testada antes de salvar), remoção e webhook próprio. */
export function ConfigAmbiente({ e, emUso }: { e: EstadoAmbiente; emUso: boolean }) {
  const i = INFO[e.ambiente];
  const id = `gw-${e.ambiente}`;
  const [chave, setChave] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [msgWh, setMsgWh] = useState<{ ok: boolean; t: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const temChave = !!e.chaveFinal;
  return (
    <section className={`card space-y-5 p-6 ${emUso ? 'ring-2 ring-impact' : ''}`} aria-labelledby={`${id}-titulo`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-titulo`} className="h3">Asaas · {i.titulo}</h2>
          <p className="text-sm text-text-secondary">Conta em <strong>{i.conta}</strong></p>
        </div>
        <div className="flex flex-wrap gap-2">{emUso && <Selo tom="ok">Em uso</Selo>}<SituacaoChave e={e} /></div>
      </div>

      <form className="space-y-4" noValidate onSubmit={(ev) => {
        ev.preventDefault(); setMsg(null); setErro(null);
        iniciar(async () => {
          const r = await salvarChaveGateway(e.ambiente, chave);
          if (r.ok) { setMsg({ ok: true, t: r.dados!.mensagem }); setChave(''); } else { setMsg({ ok: false, t: r.erro }); setErro(r.campos?.chave ?? null); }
        });
      }}>
        <div>
          <label className="rotulo" htmlFor={`${id}-chave`}>Chave de API {i.nome === 'Teste' ? 'do sandbox' : 'de produção'}</label>
          <input id={`${id}-chave`} type="password" autoComplete="off" spellCheck={false} className="campo font-mono" value={chave}
            onChange={(ev) => { setChave(ev.target.value); setErro(null); }}
            placeholder={temChave ? `Salva (final ${e.chaveFinal}) · cole outra para trocar` : '$aact_...'}
            aria-invalid={erro ? true : undefined} aria-describedby={`${id}-chave-msg`} />
          <p id={`${id}-chave-msg`} className={erro ? 'erro-campo' : 'ajuda'}>{erro ?? `No ${i.conta}: Integrações › Chave de API. Fica criptografada no cofre do banco e nunca é mostrada de novo.`}</p>
        </div>
        {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível salvar'}>{msg.t}</Aviso>}
        {!msg && e.testadoEm && <p className="legenda">Último teste em {dataHora(e.testadoEm)}: {e.testeMensagem}</p>}
        {e.viaAmbiente && !temChave && <p className="legenda">Hoje a chave deste ambiente vem de variável de ambiente do servidor. Ao salvar aqui, a do painel passa a valer.</p>}
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-primario" disabled={pendente || (!chave.trim() && !temChave)}>{pendente ? 'Testando…' : chave.trim() || !temChave ? 'Salvar e testar' : 'Testar de novo'}</button>
          {temChave && (
            <button type="button" className="btn btn-texto" disabled={pendente} onClick={() => {
              if (!confirm(`Remover a chave do Asaas ${i.nome}?${emUso ? ' Este é o ambiente em uso: o Asaas será desligado e as cobranças novas passam a ser manuais.' : ''}`)) return;
              iniciar(async () => { const r = await removerChaveGateway(e.ambiente); setMsg(r.ok ? { ok: true, t: 'Chave removida.' } : { ok: false, t: r.erro }); });
            }}>Remover chave</button>
          )}
        </div>
      </form>

      <div className="space-y-3 border-t border-divider pt-5">
        <h3 className="font-display text-lg font-extrabold">Webhook · baixa automática</h3>
        {e.webhookUrl ? (
          <div className="flex flex-wrap items-center gap-3 text-sm"><Selo tom="ok">● Configurado</Selo><code className="break-all rounded bg-surface px-2 py-1">{e.webhookUrl}</code><BotaoCopiar texto={e.webhookUrl} rotulo="Copiar URL" /></div>
        ) : <p className="text-sm text-text-secondary">Ainda não configurado nesta conta. Sem ele, os pagamentos deste ambiente não dão baixa sozinhos.</p>}
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" noValidate onSubmit={(ev) => {
          ev.preventDefault(); setMsgWh(null);
          iniciar(async () => { const r = await configurarWebhook(e.ambiente, email); setMsgWh(r.ok ? { ok: true, t: `Webhook ativo em ${r.dados!.url}.` } : { ok: false, t: r.erro }); });
        }}>
          <div>
            <label className="rotulo" htmlFor={`${id}-email`}>E-mail para avisos de falha</label>
            <input id={`${id}-email`} type="email" className="campo" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="voce@empresa.com.br" />
          </div>
          <button className="btn btn-secundario" disabled={pendente || !temChave}>Configurar webhook</button>
        </form>
        {msgWh && <Aviso tipo={msgWh.ok ? 'ok' : 'erro'} titulo={msgWh.ok ? 'Tudo certo' : 'Não foi possível'}>{msgWh.t}</Aviso>}
      </div>
    </section>
  );
}

/** Forma de pagamento padrão das cobranças novas, com opção de aplicar às que já estão em aberto. */
export function FormasPagamento({ atual }: { atual: FormaAsaas }) {
  const [forma, setForma] = useState<FormaAsaas>(atual);
  const [aplicar, setAplicar] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudou = forma !== atual || aplicar;
  return (
    <section className="card space-y-5 p-6" aria-labelledby="gw-formas">
      <div>
        <h2 id="gw-formas" className="h3">Formas de pagamento</h2>
        <p className="text-sm text-text-secondary">Como as Lojas pagam o Start, as mensalidades e as faturas avulsas geradas pelo Asaas. Vale para os dois ambientes. Na “Nova fatura” dá para escolher outra forma só para aquela cobrança.</p>
      </div>
      <form className="space-y-4" noValidate onSubmit={(ev) => {
        ev.preventDefault(); setMsg(null);
        iniciar(async () => { const r = await salvarFormaPagamento(forma, aplicar); setMsg(r.ok ? { ok: true, t: r.dados!.mensagem } : { ok: false, t: r.erro }); if (r.ok) setAplicar(false); });
      }}>
        <fieldset>
          <legend className="sr-only">Forma de pagamento padrão</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(FORMAS_ASAAS) as FormaAsaas[]).map((k) => (
              <label key={k} className="flex min-h-toque cursor-pointer gap-3 rounded-card border-[1.5px] border-border p-4 has-[:checked]:border-impact has-[:checked]:bg-surface">
                <input type="radio" name="gw-forma" value={k} className="mt-1 accent-action" checked={forma === k} onChange={() => { setForma(k); setMsg(null); }} />
                <span>
                  <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{FORMAS_ASAAS[k].titulo}</span>{atual === k && <Selo tom="ok">Em uso</Selo>}{k === 'UNDEFINED' && <Selo tom="neutro">Recomendado</Selo>}</span>
                  <span className="mt-1 block text-sm text-text-secondary">{FORMAS_ASAAS[k].detalhe}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-toque items-start gap-3 text-sm">
          <input type="checkbox" className="check mt-0.5" checked={aplicar} onChange={(ev) => { setAplicar(ev.target.checked); setMsg(null); }} />
          <span><span className="font-medium">Aplicar também às assinaturas e cobranças em aberto</span><span className="block text-text-secondary">Sem marcar, só as cobranças novas usam a forma escolhida. As já pagas não mudam.</span></span>
        </label>
        <p className="ajuda">Para Pix, a conta Asaas precisa ter uma chave Pix cadastrada; para cartão, a conta precisa estar aprovada para receber cartão.</p>
        {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Atenção'}>{msg.t}</Aviso>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primario" disabled={pendente || !mudou}>{pendente ? 'Salvando…' : 'Salvar forma de pagamento'}</button>
          {!mudou && <p className="text-sm text-text-secondary">Esta já é a forma em uso. Escolha outra para salvar.</p>}
        </div>
      </form>
    </section>
  );
}
