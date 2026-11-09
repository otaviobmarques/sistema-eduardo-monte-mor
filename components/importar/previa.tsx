'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { confirmarLote, corrigirLinha, descartarLote, excluirLinha } from '@/app/importar/actions';
import { Icone } from '@/components/icone';
import { Aviso } from '@/components/ui';
import { hora } from '@/lib/formato';

export interface LinhaPrevia {
  id: string; linha: number; dados_originais: Record<string, string>; placa_normalizada: string | null; placa_corrigida: boolean;
  renavam: string | null; modelo: string | null; patio_id: string | null; servico_id: string | null; observacao: string | null;
  resultado: 'ok' | 'erro' | 'duplicada'; mensagens: string[];
  unidade?: string | null; data_planilha?: string | null; status_os?: 'a_vistoriar' | 'frustrado' | 'vistoriado' | 'cancelado' | null;
  pagamento_status?: 'pendente' | 'pago' | 'faturado' | null; valor?: number | null; deslocamento?: number | null;
}
const STATUS_ROT = { a_vistoriar: 'A vistoriar', frustrado: 'Frustrado', vistoriado: 'Vistoriado', cancelado: 'Cancelado' } as const;
const PAG_ROT = { pendente: 'Pendente', pago: 'Pago', faturado: 'Faturado' } as const;
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const dataBr = (d: string) => d.split('-').reverse().join('/');
type Filtro = 'todas' | 'ok' | 'erro' | 'duplicada' | 'corrigidas';

export function Previa({ loteId, arquivo, solicitante, linhas, patios, servicos, base, historico = false }: {
  loteId: string; arquivo: string; solicitante: string; linhas: LinhaPrevia[]; historico?: boolean;
  patios: { id: string; nome: string }[]; servicos: { id: string; nome: string; padrao: boolean }[]; base: string;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>(() => (linhas.some((l) => l.resultado === 'erro') ? 'erro' : 'todas'));
  const [editando, setEditando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; t: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 15_000); return () => clearInterval(t); }, []);

  const n = useMemo(() => ({
    todas: linhas.length, ok: linhas.filter((l) => l.resultado === 'ok').length, erro: linhas.filter((l) => l.resultado === 'erro').length,
    duplicada: linhas.filter((l) => l.resultado === 'duplicada').length, corrigidas: linhas.filter((l) => l.placa_corrigida).length,
  }), [linhas]);
  const visiveis = linhas.filter((l) => filtro === 'todas' || (filtro === 'corrigidas' ? l.placa_corrigida : l.resultado === filtro));
  const nomePatio = (id: string | null) => patios.find((p) => p.id === id)?.nome;
  const temUnidade = linhas.some((l) => l.unidade);
  // Mostra só a parte que muda entre as unidades (ex.: “Despachante Dukar SP Utinga” → “Utinga”); o nome completo fica no título
  const prefixo = useMemo(() => {
    const us = [...new Set(linhas.map((l) => l.unidade).filter(Boolean) as string[])];
    if (us.length < 2) return '';
    let p = us[0];
    for (const u of us) while (p && !u.startsWith(p)) p = p.slice(0, -1);
    return p.slice(0, p.lastIndexOf(' ') + 1);
  }, [linhas]);
  const curta = (u: string | null | undefined) => (u ? u.slice(prefixo.length) || u : '—');
  const temPlanilha = linhas.some((l) => l.data_planilha || l.status_os || l.pagamento_status || l.valor !== null && l.valor !== undefined);
  const resumo = useMemo(() => {
    const ok = linhas.filter((l) => l.resultado === 'ok');
    const st = (s: string) => ok.filter((l) => (l.status_os ?? 'a_vistoriar') === s).length;
    return { vistoriado: st('vistoriado'), frustrado: st('frustrado'), cancelado: st('cancelado'), aVistoriar: st('a_vistoriar'), pagos: ok.filter((l) => l.pagamento_status === 'pago' || l.pagamento_status === 'faturado').length };
  }, [linhas]);
  const nomeServ = (id: string | null) => servicos.find((s) => s.id === id)?.nome;

  const cards: { k: Filtro; rot: string; cls: string }[] = [
    { k: 'ok', rot: 'Prontas', cls: 'border-ok text-ok' }, { k: 'erro', rot: 'Com erro', cls: 'border-error text-error' },
    { k: 'duplicada', rot: 'Já com OS', cls: 'border-warn text-warn' }, { k: 'corrigidas', rot: 'Placas corrigidas', cls: 'border-info text-info' },
  ];

  return (
    <div className="space-y-6 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p><span className="text-text-secondary">Arquivo:</span> <strong>{arquivo}</strong> · <span className="text-text-secondary">Solicitante:</span> <strong>{solicitante}</strong> · {n.todas} linhas</p>
        <button type="button" className="btn btn-texto btn-sm" disabled={pendente} onClick={() => { if (confirm('Descartar esta prévia? Nenhuma OS será criada.')) iniciar(async () => { await descartarLote(loteId); router.push(base); }); }}>Descartar e enviar outra</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="group" aria-label="Filtrar linhas">
        {cards.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltro(filtro === c.k ? 'todas' : c.k)} aria-pressed={filtro === c.k}
            className={`rounded-card border-2 bg-white p-4 text-left transition-colors duration-[120ms] ${filtro === c.k ? c.cls : 'border-divider'}`}>
            <span className="block text-xs font-semibold uppercase tracking-wide text-text-secondary">{c.rot}</span>
            <span className={`mt-1 block font-display text-[32px] font-black leading-none ${filtro === c.k ? '' : 'text-text'}`}>{n[c.k]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-text-secondary">Mostrando:</span>
        <button type="button" className={`rounded-full border-[1.5px] px-3 py-1 font-semibold ${filtro === 'todas' ? 'border-impact bg-impact text-white' : 'border-border'}`} onClick={() => setFiltro('todas')}>Todas ({n.todas})</button>
        {filtro !== 'todas' && <span className="font-semibold">{cards.find((c) => c.k === filtro)?.rot} ({visiveis.length})</span>}
      </div>
      {temPlanilha && (historico
        ? <Aviso tipo="info" titulo="Importação do histórico (feita pela Loja)">Valem a <strong>data</strong>, o <strong>status</strong>, o <strong>pagamento</strong> e o <strong>valor</strong> de cada linha. Das prontas: {resumo.vistoriado} vistoriada(s), {resumo.frustrado} frustrada(s), {resumo.cancelado} cancelada(s), {resumo.aVistoriar} a vistoriar; {resumo.pagos} paga(s). As vistoriadas não entram nas métricas de prazo (a planilha não traz o horário do laudo).</Aviso>
        : <Aviso tipo="info" titulo="Pedidos novos">Todas as linhas viram OS novas “A vistoriar”, com a abertura de agora. Data, status, pagamento e valor da planilha não são usados: o valor segue a tabela de preços da Auto Visão.</Aviso>)}
      {msg && <Aviso tipo={msg.tipo} titulo={msg.tipo === 'ok' ? 'Tudo certo' : 'Atenção'}>{msg.t}</Aviso>}

      <div className="overflow-x-auto">
        <table className="tabela tabela-cartoes">
          <thead><tr><th scope="col">Linha</th><th scope="col">Placa</th><th scope="col">Modelo</th><th scope="col">Renavam</th>{temUnidade && <th scope="col">Unidade</th>}<th scope="col">Pátio</th><th scope="col">Serviço</th>{historico && temPlanilha && <th scope="col">Na planilha</th>}<th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {visiveis.map((l) => editando === l.id ? (
              <LinhaEdicao key={l.id} l={l} patios={patios} servicos={servicos} colUnidade={temUnidade} unidadeCurta={curta(l.unidade)} colPlanilha={historico && temPlanilha} onCancelar={() => setEditando(null)}
                onSalvar={(b) => iniciar(async () => {
                  const r = await corrigirLinha(loteId, l.id, b);
                  setMsg(r.ok ? { tipo: 'ok', t: `Linha ${l.linha} pronta.` } : { tipo: 'erro', t: `Linha ${l.linha}: ${r.erro}` });
                  setEditando(null); router.refresh();
                })} />
            ) : (
              <tr key={l.id} className={l.resultado === 'erro' ? 'shadow-[inset_4px_0_0_#B42318]' : l.resultado === 'duplicada' ? 'shadow-[inset_4px_0_0_#805500]' : ''}>
                <td data-rotulo="Linha" className="text-text-secondary">{l.linha}</td>
                <td data-rotulo="Placa">
                  <span className="font-display font-black tracking-wide">{l.placa_normalizada || '—'}</span>
                  {l.placa_corrigida && <span className="block text-xs text-info">digitada {l.dados_originais.placa}</span>}
                </td>
                <td data-rotulo="Modelo" className="max-w-[240px]">{l.modelo ?? <span className="text-text-secondary">—</span>}</td>
                <td data-rotulo="Renavam" className="whitespace-nowrap">{l.renavam ?? (l.dados_originais.renavam ? <span className="text-error">{l.dados_originais.renavam}</span> : '—')}</td>
                {temUnidade && <td data-rotulo="Unidade" className="max-w-[160px] text-sm" title={l.unidade ?? undefined}>{curta(l.unidade)}</td>}
                <td data-rotulo="Pátio">{nomePatio(l.patio_id) ?? <span className="text-error">{l.dados_originais.patio ?? '—'}</span>}</td>
                <td data-rotulo="Serviço">{nomeServ(l.servico_id) ?? <span className="text-error">{l.dados_originais.servico ?? '—'}</span>}</td>
                {historico && temPlanilha && (
                  <td data-rotulo="Na planilha" className="whitespace-nowrap text-xs">
                    <span className="block">{l.data_planilha ? dataBr(l.data_planilha) : 'Sem data'} · {STATUS_ROT[l.status_os ?? 'a_vistoriar']}</span>
                    <span className="block text-text-secondary">{PAG_ROT[l.pagamento_status ?? 'pendente']}{l.valor !== null && l.valor !== undefined ? ` · ${brl(Number(l.valor) + Number(l.deslocamento ?? 0))}` : ' · tabela'}</span>
                  </td>
                )}
                <td data-rotulo="Situação" className="max-w-[300px]">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${l.resultado === 'ok' ? 'bg-ok-bg text-ok' : l.resultado === 'erro' ? 'bg-error-bg text-error' : 'bg-warn-bg text-warn'}`}>
                    {l.resultado === 'ok' ? '● Pronta' : l.resultado === 'erro' ? '■ Com erro' : '◆ Já com OS'}
                  </span>
                  {l.mensagens.filter((m) => !(l.resultado === 'ok' && m.startsWith('Placa corrigida'))).map((m) => <span key={m} className="mt-1 block text-xs">{m}</span>)}
                </td>
                <td data-rotulo="" className="whitespace-nowrap text-right">
                  {l.resultado !== 'ok' && <button type="button" className="btn btn-texto btn-sm" onClick={() => setEditando(l.id)}>Corrigir</button>}
                  <button type="button" className="btn btn-texto btn-sm" disabled={pendente} aria-label={`Excluir linha ${l.linha}`}
                    onClick={() => iniciar(async () => { await excluirLinha(loteId, l.id); router.refresh(); })}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fixed inset-x-0 bottom-[56px] z-20 border-t border-divider bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,.08)] backdrop-blur min-[900px]:bottom-0 min-[900px]:left-64">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm" aria-live="polite">
            <strong className="font-display text-lg font-black">{n.ok} OS</strong> serão criadas {historico && linhas.some((l) => l.data_planilha) ? <>com a <strong>data de cada linha</strong></> : <>com abertura às <strong>{hora(agora)}</strong></>}
            {n.erro + n.duplicada > 0 && <span className="text-text-secondary"> · {n.erro + n.duplicada} linha{n.erro + n.duplicada === 1 ? '' : 's'} fica{n.erro + n.duplicada === 1 ? '' : 'm'} de fora</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {n.erro + n.duplicada > 0 && <a href={`/api/importacao/${loteId}/erros`} className="btn btn-secundario"><Icone nome="download" className="h-4 w-4" />Baixar linhas com erro</a>}
            <button type="button" className="btn btn-primario" disabled={pendente || n.ok === 0}
              onClick={() => iniciar(async () => {
                const r = await confirmarLote(loteId);
                if (r.ok) router.refresh(); else setMsg({ tipo: 'erro', t: r.erro });
              })}>{pendente ? 'Criando…' : `Criar ${n.ok} OS`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinhaEdicao({ l, patios, servicos, onSalvar, onCancelar, colUnidade, colPlanilha, unidadeCurta }: {
  l: LinhaPrevia; patios: { id: string; nome: string }[]; servicos: { id: string; nome: string }[]; colUnidade?: boolean; colPlanilha?: boolean; unidadeCurta?: string;
  onSalvar: (b: { placa: string; modelo: string; renavam: string; patio: string; servico: string; obs: string }) => void; onCancelar: () => void;
}) {
  const [b, setB] = useState({
    placa: l.placa_normalizada || l.dados_originais.placa || '', modelo: l.modelo ?? '', renavam: l.renavam ?? l.dados_originais.renavam ?? '',
    patio: patios.find((p) => p.id === l.patio_id)?.nome ?? l.dados_originais.patio ?? '',
    servico: servicos.find((s) => s.id === l.servico_id)?.nome ?? l.dados_originais.servico ?? '', obs: l.observacao ?? '',
  });
  const set = (k: keyof typeof b) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setB((x) => ({ ...x, [k]: e.target.value }));
  return (
    <tr className="bg-info-bg">
      <td data-rotulo="Linha">{l.linha}</td>
      <td data-rotulo="Placa"><label className="sr-only" htmlFor={`e-placa-${l.id}`}>Placa</label><input id={`e-placa-${l.id}`} className="campo h-10 w-28 uppercase" value={b.placa} onChange={set('placa')} autoFocus /></td>
      <td data-rotulo="Modelo"><label className="sr-only" htmlFor={`e-mod-${l.id}`}>Modelo</label><input id={`e-mod-${l.id}`} className="campo h-10" value={b.modelo} onChange={set('modelo')} /></td>
      <td data-rotulo="Renavam"><label className="sr-only" htmlFor={`e-ren-${l.id}`}>Renavam</label><input id={`e-ren-${l.id}`} className="campo h-10 w-32" inputMode="numeric" value={b.renavam} onChange={set('renavam')} /></td>
      {colUnidade && <td data-rotulo="Unidade" className="max-w-[160px] text-sm" title={l.unidade ?? undefined}>{unidadeCurta}</td>}
      <td data-rotulo="Pátio">
        <label className="sr-only" htmlFor={`e-pat-${l.id}`}>Pátio</label>
        <select id={`e-pat-${l.id}`} className="campo h-10" value={patios.some((p) => p.nome === b.patio) ? b.patio : ''} onChange={set('patio')}>
          <option value="">Selecione</option>{patios.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
        </select>
      </td>
      <td data-rotulo="Serviço">
        <label className="sr-only" htmlFor={`e-srv-${l.id}`}>Serviço</label>
        <select id={`e-srv-${l.id}`} className="campo h-10" value={servicos.some((s) => s.nome === b.servico) ? b.servico : ''} onChange={set('servico')}>
          <option value="">Padrão</option>{servicos.map((s) => <option key={s.id} value={s.nome}>{s.nome}</option>)}
        </select>
      </td>
      {colPlanilha && <td data-rotulo="Na planilha" className="text-xs text-text-secondary">mantidos</td>}
      <td data-rotulo="Situação" className="text-xs">{l.mensagens.join(' ')}</td>
      <td data-rotulo="" className="whitespace-nowrap text-right">
        <button type="button" className="btn btn-primario btn-sm" onClick={() => onSalvar(b)}>Salvar</button>
        <button type="button" className="btn btn-texto btn-sm" onClick={onCancelar}>Cancelar</button>
      </td>
    </tr>
  );
}
