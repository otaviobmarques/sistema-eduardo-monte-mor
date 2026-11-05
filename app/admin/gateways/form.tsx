'use client';
import { useState, useTransition } from 'react';
import { Aviso, BotaoCopiar, Selo } from '@/components/ui';
import { dataHora } from '@/lib/formato';
import { configurarWebhook, salvarGateway } from '../actions';

export interface EstadoAsaas {
  ativo: boolean; ambiente: 'sandbox' | 'producao'; chaveFinal: string | null; testadoEm: string | null; testeOk: boolean | null;
  testeMensagem: string | null; webhookUrl: string | null; viaAmbiente: boolean;
}

export function GatewayAsaas({ e }: { e: EstadoAsaas }) {
  const [ambiente, setAmbiente] = useState(e.ambiente);
  const [ativo, setAtivo] = useState(e.ativo || !e.chaveFinal);
  const [chave, setChave] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [msgWh, setMsgWh] = useState<{ ok: boolean; t: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  const status = e.ativo && e.chaveFinal ? (e.testeOk === false ? <Selo tom="erro">■ Com erro</Selo> : <Selo tom="ok">● Ativo</Selo>) : e.chaveFinal ? <Selo tom="neutro">Desativado</Selo> : <Selo tom="neutro">Não configurado</Selo>;

  return (
    <section className="card space-y-5 p-6" aria-labelledby="gw-asaas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gw-asaas" className="h3">Asaas</h2>
          <p className="text-sm text-text-secondary">Pix, boleto e cartão · assinatura mensal · baixa automática pelo webhook</p>
        </div>
        {status}
      </div>

      <details className="rounded-card bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Como obter a chave de API</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Para testar, crie uma conta em <strong>sandbox.asaas.com</strong> (para cobrar de verdade, use a conta em asaas.com).</li>
          <li>No Asaas, abra <strong>Integrações → Chave de API</strong> e gere uma chave.</li>
          <li>Cole a chave abaixo, escolha o ambiente correspondente e clique em <strong>Salvar e testar</strong>.</li>
          <li>Depois clique em <strong>Configurar webhook</strong> para o Asaas avisar o sistema quando uma fatura for paga.</li>
        </ol>
      </details>

      <form className="space-y-4" noValidate onSubmit={(ev) => {
        ev.preventDefault(); setMsg(null);
        iniciar(async () => {
          const r = await salvarGateway('asaas', { ambiente, ativo, chave });
          if (r.ok) { setMsg({ ok: true, t: r.dados!.mensagem }); setChave(''); setErros({}); } else { setMsg({ ok: false, t: r.erro }); setErros(r.campos ?? {}); }
        });
      }}>
        <fieldset>
          <legend className="rotulo">Ambiente</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([['sandbox', 'Teste (sandbox)', 'Cobranças de mentira, para validar o fluxo.'], ['producao', 'Produção', 'Cobranças reais para as Lojas.']] as const).map(([k, t, d]) => (
              <label key={k} className="flex min-h-toque cursor-pointer gap-3 rounded-card border-[1.5px] border-border p-4 has-[:checked]:border-impact has-[:checked]:bg-surface">
                <input type="radio" name="ambiente" className="mt-1 accent-action" checked={ambiente === k} onChange={() => setAmbiente(k)} />
                <span><span className="block font-semibold">{t}</span><span className="text-sm text-text-secondary">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="rotulo" htmlFor="gw-chave">Chave de API</label>
          <input id="gw-chave" type="password" autoComplete="off" spellCheck={false} className="campo font-mono" value={chave} onChange={(ev) => { setChave(ev.target.value); setErros({}); }}
            placeholder={e.chaveFinal ? `Chave salva terminando em ${e.chaveFinal} — deixe em branco para manter` : '$aact_...'} aria-invalid={erros.chave ? true : undefined} aria-describedby="gw-chave-msg" />
          <p id="gw-chave-msg" className={erros.chave ? 'erro-campo' : 'ajuda'}>{erros.chave ?? 'Fica criptografada no cofre do banco. Nunca é mostrada de novo.'}</p>
        </div>
        <label className="flex min-h-toque items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="check" checked={ativo} onChange={(ev) => setAtivo(ev.target.checked)} />Usar o Asaas para cobrar as Lojas
        </label>
        {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível salvar'}>{msg.t}</Aviso>}
        {!msg && e.testadoEm && <p className="legenda">Último teste em {dataHora(e.testadoEm)}: {e.testeMensagem}</p>}
        {e.viaAmbiente && <p className="legenda">Hoje a chave vem de variável de ambiente do servidor. Ao salvar aqui, a do painel passa a valer.</p>}
        <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Testando…' : 'Salvar e testar'}</button>
      </form>

      <div className="space-y-3 border-t border-divider pt-5">
        <h3 className="font-display text-lg font-extrabold">Webhook (baixa automática)</h3>
        {e.webhookUrl ? (
          <div className="flex flex-wrap items-center gap-3 text-sm"><Selo tom="ok">● Configurado</Selo><code className="break-all rounded bg-surface px-2 py-1">{e.webhookUrl}</code><BotaoCopiar texto={e.webhookUrl} rotulo="Copiar URL" /></div>
        ) : <p className="text-sm text-text-secondary">Ainda não configurado. Sem ele, os pagamentos não dão baixa sozinhos.</p>}
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" noValidate onSubmit={(ev) => {
          ev.preventDefault(); setMsgWh(null);
          iniciar(async () => { const r = await configurarWebhook(email); setMsgWh(r.ok ? { ok: true, t: `Webhook ativo em ${r.dados!.url}.` } : { ok: false, t: r.erro }); });
        }}>
          <div>
            <label className="rotulo" htmlFor="gw-email">E-mail para avisos de falha do webhook</label>
            <input id="gw-email" type="email" className="campo" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="voce@empresa.com.br" />
          </div>
          <button className="btn btn-secundario" disabled={pendente || !e.chaveFinal}>Configurar webhook</button>
        </form>
        {msgWh && <Aviso tipo={msgWh.ok ? 'ok' : 'erro'} titulo={msgWh.ok ? 'Tudo certo' : 'Não foi possível'}>{msgWh.t}</Aviso>}
      </div>
    </section>
  );
}
