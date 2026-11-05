'use client';
import { useState, useTransition } from 'react';
import { Aviso, Modal, Selo } from '@/components/ui';
import { data as fmtData, moeda, parseMoeda } from '@/lib/formato';
import { alterarBloqueioLoja, ativarCobranca, criarFaturaManual, darBaixaFatura } from './actions';

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

export function CobrancaLoja({ lojaId, faturas, asaasAtivo, temAssinatura, ambiente }: { lojaId: string; faturas: FaturaVista[]; asaasAtivo: boolean; temAssinatura: boolean; ambiente: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ tipo: 'avulsa', descricao: '', valor: '', vencimento: new Date(Date.now() - 3 * 3600_000 + 5 * 86400_000).toISOString().slice(0, 10) });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();
  return (
    <section className="card space-y-4 p-6" aria-labelledby="cob-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="cob-titulo" className="h3">Cobrança</h2>
        <Selo tom={asaasAtivo ? 'info' : 'neutro'}>{asaasAtivo ? `Asaas · ${ambiente === 'producao' ? 'produção' : 'teste (sandbox)'}` : 'Asaas não configurado'}</Selo>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primario" disabled={pendente || !asaasAtivo} onClick={() => iniciar(async () => {
          const r = await ativarCobranca(lojaId);
          setMsg(r.ok ? { ok: true, t: r.dados!.criadas ? `${r.dados!.criadas} cobrança(s) criada(s) no Asaas. A Loja recebe o link por e-mail.` : 'A cobrança já estava ativa.' } : { ok: false, t: r.erro });
        })}>{temAssinatura ? 'Sincronizar cobrança' : 'Ativar cobrança (Start + mensalidade)'}</button>
        <button type="button" className="btn btn-secundario" onClick={() => setAberto(true)}>Nova fatura manual</button>
      </div>
      {!asaasAtivo && <p className="ajuda">Sem a chave do Asaas, registre faturas manuais e dê baixa quando receber.</p>}
      {msg && <Aviso tipo={msg.ok ? 'ok' : 'erro'} titulo={msg.ok ? 'Tudo certo' : 'Não foi possível'}>{msg.t}</Aviso>}
      <TabelaFaturas faturas={faturas} admin />
      <Modal aberto={aberto} onFechar={() => setAberto(false)} titulo="Nova fatura manual" descricao="Para cobranças fora do Asaas. Dê baixa quando receber.">
        <form className="space-y-4" noValidate onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await criarFaturaManual(lojaId, { ...f, tipo: f.tipo as 'avulsa', valor: parseMoeda(f.valor) ?? 0 });
            if (r.ok) setAberto(false); else setErros(r.campos ?? { descricao: r.erro });
          });
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="rotulo" htmlFor="fm-tipo">Tipo</label>
              <select id="fm-tipo" className="campo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="start">Start do projeto</option><option value="mensalidade">Mensalidade</option><option value="avulsa">Avulsa</option></select></div>
            <div><label className="rotulo" htmlFor="fm-venc">Vencimento</label><input id="fm-venc" type="date" className="campo" value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />{erros.vencimento && <p className="erro-campo">{erros.vencimento}</p>}</div>
          </div>
          <div><label className="rotulo" htmlFor="fm-desc">Descrição</label><input id="fm-desc" className="campo" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Mensalidade 11/2026" />{erros.descricao && <p className="erro-campo">{erros.descricao}</p>}</div>
          <div><label className="rotulo" htmlFor="fm-valor">Valor</label><div className="relative"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">R$</span><input id="fm-valor" className="campo pl-11" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>{erros.valor && <p className="erro-campo">{erros.valor}</p>}</div>
          <div className="flex justify-end gap-3"><button type="button" className="btn btn-secundario" onClick={() => setAberto(false)}>Voltar</button><button className="btn btn-primario" disabled={pendente}>Criar fatura</button></div>
        </form>
      </Modal>
    </section>
  );
}
