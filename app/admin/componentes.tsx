'use client';
import { useState, useTransition } from 'react';
import { Aviso, Modal, Selo } from '@/components/ui';
import { data as fmtData, moeda, parseMoeda } from '@/lib/formato';
import { alterarBloqueioLoja, ativarCobranca, criarFatura, darBaixaFatura } from './actions';

export function SituacaoLoja({ lojaId, bloqueada, motivo, automatico, desde }: { lojaId: string; bloqueada: boolean; motivo: string | null; automatico: boolean; desde: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <section className="card space-y-4 p-6" aria-labelledby="sit-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sit-titulo" className="h3">Situação</h2>
        {bloqueada ? <Selo tom="erro">■ Bloqueada</Selo> : <Selo tom="ok">● Liberada</Selo>}
      </div>
      {bloqueada ? (
        <>
          <p className="text-sm">{motivo}{desde ? ` · desde ${fmtData(desde)}` : ''}{automatico ? ' (automático por atraso; libera sozinho quando a fatura for paga)' : ''}</p>
          <button type="button" className="btn btn-primario" disabled={pendente} onClick={() => iniciar(async () => { const r = await alterarBloqueioLoja(lojaId, false, ''); if (!r.ok) setErro(r.erro); })}>Desbloquear Loja</button>
        </>
      ) : (
        <>
          <p className="text-sm text-text-secondary">Bloquear suspende o acesso do Gestor e de todos os clientes desta Loja. Os dados ficam guardados.</p>
          <button type="button" className="btn btn-texto" onClick={() => setAberto(true)}>Bloquear Loja</button>
        </>
      )}
      {erro && <Aviso tipo="erro" titulo="Não foi possível concluir">{erro}</Aviso>}
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo="Bloquear Loja" descricao="O Gestor e os clientes da Loja deixam de acessar o sistema imediatamente.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); iniciar(async () => { const r = await alterarBloqueioLoja(lojaId, true, texto); if (r.ok) setAberto(false); else setErro(r.erro); }); }}>
          <div><label className="rotulo" htmlFor="bl-motivo">Motivo</label><input id="bl-motivo" className="campo" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ex.: mensalidade de outubro em aberto" /></div>
          {erro && <p className="erro-campo">{erro}</p>}
          <div className="flex justify-end gap-3"><button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Voltar</button><button className="btn btn-primario" disabled={pendente}>Bloquear</button></div>
        </form>
      </Modal>
    </section>
  );
}

export interface FaturaVista { id: string; tipo: 'start' | 'mensalidade' | 'avulsa'; descricao: string; valor: number; vencimento: string; status: 'pendente' | 'pago' | 'vencido' | 'cancelado'; link_pagamento: string | null; pago_em: string | null; asaas_payment_id: string | null; loja?: string }

export function SeloFatura({ s }: { s: FaturaVista['status'] }) {
  return { pendente: <Selo tom="atencao">◆ Em aberto</Selo>, pago: <Selo tom="ok">● Paga</Selo>, vencido: <Selo tom="erro">■ Vencida</Selo>, cancelado: <Selo tom="neutro">Cancelada</Selo> }[s];
}

export function TabelaFaturas({ faturas, admin, mostrarLoja }: { faturas: FaturaVista[]; admin?: boolean; mostrarLoja?: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  if (!faturas.length) return <p className="text-sm text-text-secondary">Nenhuma fatura ainda.</p>;
  return (
    <div className="space-y-3">
      {erro && <Aviso tipo="erro" titulo="Não foi possível dar baixa">{erro}</Aviso>}
      <div className="overflow-x-auto">
        <table className="tabela tabela-cartoes">
          <thead><tr>{mostrarLoja && <th scope="col">Loja</th>}<th scope="col">Fatura</th><th scope="col">Vencimento</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {faturas.map((f) => (
              <tr key={f.id} className={f.status === 'vencido' ? 'shadow-[inset_4px_0_0_#B42318]' : ''}>
                {mostrarLoja && <td data-rotulo="Loja" className="font-semibold">{f.loja}</td>}
                <td data-rotulo="Fatura">{f.descricao}{f.asaas_payment_id && <span className="block text-xs text-text-secondary">Asaas</span>}</td>
                <td data-rotulo="Vencimento" className="whitespace-nowrap">{fmtData(f.vencimento)}</td>
                <td data-rotulo="Valor" className="whitespace-nowrap font-semibold">{moeda(f.valor)}</td>
                <td data-rotulo="Situação"><SeloFatura s={f.status} />{f.pago_em && <span className="mt-1 block text-xs text-text-secondary">em {fmtData(f.pago_em)}</span>}</td>
                <td data-rotulo="" className="whitespace-nowrap text-right">
                  {f.link_pagamento && f.status !== 'pago' && f.status !== 'cancelado' && <a href={f.link_pagamento} target="_blank" rel="noreferrer" className="btn btn-secundario btn-sm">{admin ? 'Ver cobrança' : 'Pagar'}</a>}
                  {admin && (f.status === 'pendente' || f.status === 'vencido') && (
                    <button type="button" className="btn btn-texto btn-sm" disabled={pendente}
                      onClick={() => { if (confirm('Confirmar o recebimento desta fatura?')) iniciar(async () => { const r = await darBaixaFatura(f.id); if (!r.ok) setErro(r.erro); }); }}>Dar baixa</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NovaFatura({ lojas, lojaFixa, gatewayAtivo, rotulo = 'Nova fatura' }: { lojas: { id: string; nome: string; temCnpj: boolean }[]; lojaFixa?: string; gatewayAtivo: boolean; rotulo?: string }) {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const vazio = () => ({ loja_id: lojaFixa ?? '', tipo: 'mensalidade', descricao: `Mensalidade ${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`, valor: '', vencimento: new Date(Date.now() - 3 * 3600_000 + 5 * 86400_000).toISOString().slice(0, 10), via_gateway: gatewayAtivo });
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ link: string | null } | null>(null);
  const [pendente, iniciar] = useTransition();
  const loja = lojas.find((l) => l.id === f.loja_id);
  const set = (k: keyof ReturnType<typeof vazio>, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErros((e) => ({ ...e, [k]: '' })); };
  const tipoTexto = { start: 'Start do projeto', mensalidade: `Mensalidade ${hoje.slice(5, 7)}/${hoje.slice(0, 4)}`, avulsa: '' } as const;
  return (
    <>
      <button type="button" className="btn btn-primario" onClick={() => { setF(vazio()); setErros({}); setErro(null); setFeito(null); setAberto(true); }}>{rotulo}</button>
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo={feito ? 'Fatura criada' : 'Nova fatura'} descricao={feito ? undefined : 'Escolha a Loja e como cobrar.'} largura="max-w-xl">
        {feito ? (
          <div className="space-y-4">
            <Aviso tipo="ok" titulo="Tudo certo">{feito.link ? 'A Loja recebe o link de pagamento por e-mail (Pix, boleto ou cartão).' : 'Fatura manual registrada. Dê baixa quando receber.'}</Aviso>
            {feito.link && <a href={feito.link} target="_blank" rel="noreferrer" className="btn btn-secundario w-full">Abrir link de pagamento</a>}
            <div className="flex justify-end"><button type="button" className="btn btn-primario" onClick={() => setAberto(false)}>Fechar</button></div>
          </div>
        ) : (
          <form className="space-y-4" noValidate onSubmit={(e) => {
            e.preventDefault(); setErro(null);
            iniciar(async () => {
              const r = await criarFatura({ ...f, tipo: f.tipo as 'avulsa', valor: parseMoeda(f.valor) ?? 0 });
              if (r.ok) setFeito({ link: r.dados?.link ?? null }); else { setErros(r.campos ?? {}); setErro(r.erro); }
            });
          }}>
            <div>
              <label className="rotulo" htmlFor="nf-loja">Loja</label>
              <select id="nf-loja" className="campo" value={f.loja_id} disabled={!!lojaFixa} onChange={(e) => set('loja_id', e.target.value)} aria-invalid={erros.loja_id ? true : undefined}>
                <option value="">Selecione a Loja</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              {erros.loja_id && <p className="erro-campo">{erros.loja_id}</p>}
            </div>
            <fieldset>
              <legend className="rotulo">Tipo</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {([['mensalidade', 'Mensalidade'], ['start', 'Start do projeto'], ['avulsa', 'Avulsa']] as const).map(([k, t]) => (
                  <label key={k} className="flex min-h-toque cursor-pointer items-center gap-2 rounded-campo border-[1.5px] border-border px-3 text-sm has-[:checked]:border-impact has-[:checked]:bg-surface has-[:checked]:font-semibold">
                    <input type="radio" name="nf-tipo" className="accent-action" checked={f.tipo === k} onChange={() => setF((x) => ({ ...x, tipo: k, descricao: tipoTexto[k] || x.descricao }))} />{t}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className="rotulo" htmlFor="nf-desc">Descrição</label>
              <input id="nf-desc" className="campo" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} aria-invalid={erros.descricao ? true : undefined} />
              {erros.descricao && <p className="erro-campo">{erros.descricao}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="rotulo" htmlFor="nf-valor">Valor</label>
                <div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">R$</span>
                  <input id="nf-valor" className="campo pl-11" inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => set('valor', e.target.value)} aria-invalid={erros.valor ? true : undefined} /></div>
                {erros.valor && <p className="erro-campo">{erros.valor}</p>}
              </div>
              <div>
                <label className="rotulo" htmlFor="nf-venc">Vencimento</label>
                <input id="nf-venc" type="date" className="campo" value={f.vencimento} onChange={(e) => set('vencimento', e.target.value)} aria-invalid={erros.vencimento ? true : undefined} />
                {erros.vencimento && <p className="erro-campo">{erros.vencimento}</p>}
              </div>
            </div>
            <label className={`flex min-h-toque items-start gap-3 rounded-card border-[1.5px] p-4 text-sm ${gatewayAtivo ? 'cursor-pointer border-border has-[:checked]:border-impact has-[:checked]:bg-surface' : 'border-divider text-text-secondary'}`}>
              <input type="checkbox" className="check mt-0.5" checked={f.via_gateway} disabled={!gatewayAtivo} onChange={(e) => set('via_gateway', e.target.checked)} />
              <span>
                <span className="block font-semibold">Cobrar pelo Asaas (Pix, boleto ou cartão)</span>
                {gatewayAtivo ? (loja && !loja.temCnpj && f.via_gateway ? <span className="text-error">Esta Loja não tem CNPJ cadastrado; o Asaas exige.</span> : 'Gera o link de pagamento, envia para a Loja e dá baixa sozinho quando pagar.')
                  : <>Ative o Asaas em <a className="font-semibold text-action underline" href="/admin/gateways">Gateways de pagamento</a>. Sem ele, a fatura é manual e você dá baixa ao receber.</>}
              </span>
            </label>
            {erro && <Aviso tipo="erro" titulo="Não foi possível criar">{erro}</Aviso>}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Voltar</button>
              <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Criando…' : f.via_gateway ? 'Gerar cobrança' : 'Registrar fatura manual'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function CobrancaLoja({ loja, faturas, asaasAtivo, temAssinatura, ambiente }: { loja: { id: string; nome: string; temCnpj: boolean }; faturas: FaturaVista[]; asaasAtivo: boolean; temAssinatura: boolean; ambiente: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <section className="card space-y-4 p-6" aria-labelledby="cob-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cob-titulo" className="h3">Cobrança</h2>
        <Selo tom={asaasAtivo ? 'info' : 'neutro'}>{asaasAtivo ? `Asaas · ${ambiente === 'producao' ? 'produção' : 'teste (sandbox)'}` : 'Sem gateway ativo'}</Selo>
      </div>
      <div className="flex flex-wrap gap-3">
        <NovaFatura lojas={[loja]} lojaFixa={loja.id} gatewayAtivo={asaasAtivo} />
        <button type="button" className="btn btn-secundario" disabled={pendente || !asaasAtivo} onClick={() => iniciar(async () => {
          const r = await ativarCobranca(loja.id);
          setMsg(r.ok ? { ok: true, t: r.dados!.criadas ? `${r.dados!.criadas} cobrança(s) criada(s) no Asaas. A Loja recebe o link por e-mail.` : 'A cobrança já estava ativa.' } : { ok: false, t: r.erro });
        })}>{temAssinatura ? 'Sincronizar assinatura' : 'Ativar assinatura (Start + mensalidade)'}</button>
      </div>
      {!asaasAtivo && <p className="ajuda">A assinatura automática precisa do Asaas ativo em <a className="font-semibold text-action underline" href="/admin/gateways">Gateways de pagamento</a>.</p>}
      {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível'}>{msg.t}</Aviso>}
      <TabelaFaturas faturas={faturas} admin />
    </section>
  );
}
