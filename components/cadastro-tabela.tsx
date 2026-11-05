'use client';
import { useMemo, useState, useTransition } from 'react';
import { alternarAtivo, excluirCadastro, salvarCadastro } from '@/app/loja/cadastros/actions';
import type { TabelaCadastro } from '@/lib/cadastros';
import { data as fmtData, moeda, parseMoeda, UFS, valorParaCampo } from '@/lib/formato';
import { Icone } from './icone';
import { Aviso, Modal, Selo } from './ui';

export type Opcao = { valor: string; rotulo: string };
export interface Campo {
  nome: string;
  rotulo: string;
  tipo: 'texto' | 'numero' | 'moeda' | 'uf' | 'booleano' | 'select' | 'data';
  opcoes?: Opcao[];
  ajuda?: string;
  placeholder?: string;
  obrigatorio?: boolean;
  meia?: boolean;
}
export interface Coluna { campo: string; rotulo: string; formato?: 'moeda' | 'booleano' | 'opcao' | 'data' | 'horas'; destaque?: boolean }
export type Registro = { id: string } & Record<string, unknown>;

function formatar(v: unknown, c: Coluna, campos: Campo[]) {
  if (v === null || v === undefined || v === '') return <span className="text-text-secondary">—</span>;
  switch (c.formato) {
    case 'moeda': return moeda(v as number);
    case 'data': return fmtData(v as string);
    case 'horas': return `${v}h`;
    case 'booleano': return v ? 'Sim' : 'Não';
    case 'opcao': return campos.find((f) => f.nome === c.campo)?.opcoes?.find((o) => o.valor === v)?.rotulo ?? String(v);
    default: return String(v);
  }
}

export function CadastroTabela({
  tabela, titulo, descricao, campos, colunas, registros, rotuloNovo = 'Adicionar', padrao = {}, podeExcluir = false, temAtivo = true, busca = true, vazio,
}: {
  tabela: TabelaCadastro; titulo: string; descricao?: string; campos: Campo[]; colunas: Coluna[]; registros: Registro[];
  rotuloNovo?: string; padrao?: Record<string, unknown>; podeExcluir?: boolean; temAtivo?: boolean; busca?: boolean; vazio?: string;
}) {
  const [editando, setEditando] = useState<Registro | 'novo' | null>(null);
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [msgLista, setMsgLista] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return registros.filter((r) => (mostrarInativos || !temAtivo || r.ativo !== false) &&
      (!f || colunas.some((c) => String(formatar(r[c.campo], c, campos) ?? '').toLowerCase().includes(f) || String(r[c.campo] ?? '').toLowerCase().includes(f))));
  }, [registros, filtro, mostrarInativos, temAtivo, colunas, campos]);
  const inativos = temAtivo ? registros.filter((r) => r.ativo === false).length : 0;

  function abrir(r: Registro | 'novo') {
    const base: Record<string, unknown> = r === 'novo' ? { ativo: true, ...padrao } : r;
    const v: Record<string, unknown> = {};
    for (const c of campos) {
      const x = base[c.nome];
      v[c.nome] = c.tipo === 'moeda' ? valorParaCampo(x as number) : c.tipo === 'booleano' ? Boolean(x) : (x ?? '');
    }
    setValores(v); setErro(null); setErrosCampo({}); setEditando(r);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const dados: Record<string, unknown> = {};
    for (const c of campos) {
      const x = valores[c.nome];
      dados[c.nome] = c.tipo === 'moeda' ? parseMoeda(x as string) ?? 'x' : x;
    }
    iniciar(async () => {
      const r = await salvarCadastro(tabela, editando === 'novo' ? null : (editando as Registro).id, dados);
      if (r.ok) setEditando(null);
      else { setErro(r.erro); setErrosCampo(r.campos ?? {}); }
    });
  }

  function acao(fn: () => Promise<{ ok: boolean; erro?: string }>) {
    setMsgLista(null);
    iniciar(async () => { const r = await fn(); if (!r.ok) setMsgLista(r.erro ?? 'Não foi possível concluir.'); });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="h3">{titulo}</h2>
          {descricao && <p className="mt-1 text-sm text-text-secondary">{descricao}</p>}
        </div>
        <button type="button" className="btn btn-primario" onClick={() => abrir('novo')}><Icone nome="mais" />{rotuloNovo}</button>
      </div>

      {(busca || inativos > 0) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {busca && (
            <div className="relative w-full sm:max-w-xs">
              <label htmlFor={`busca-${tabela}`} className="sr-only">Buscar</label>
              <Icone nome="auditoria" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
              <input id={`busca-${tabela}`} className="campo pl-10" placeholder="Buscar" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            </div>
          )}
          {inativos > 0 && (
            <label className="flex min-h-toque items-center gap-2 text-sm">
              <input type="checkbox" className="check" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
              Mostrar inativos ({inativos})
            </label>
          )}
        </div>
      )}

      {msgLista && <Aviso tipo="erro" titulo="Não foi possível concluir">{msgLista}</Aviso>}

      {visiveis.length === 0 ? (
        <div className="card p-8 text-center text-text-secondary">{filtro ? 'Nada encontrado com essa busca.' : vazio ?? 'Nenhum registro ainda.'}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabela tabela-cartoes">
            <thead>
              <tr>
                {colunas.map((c) => <th key={c.campo} scope="col">{c.rotulo}</th>)}
                {temAtivo && <th scope="col">Situação</th>}
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => (
                <tr key={r.id} className={r.ativo === false ? 'text-text-secondary' : ''}>
                  {colunas.map((c) => (
                    <td key={c.campo} data-rotulo={c.rotulo} className={c.destaque ? 'font-semibold' : ''}>{formatar(r[c.campo], c, campos)}</td>
                  ))}
                  {temAtivo && <td data-rotulo="Situação">{r.ativo === false ? <Selo tom="neutro">Inativo</Selo> : <Selo tom="ok">Ativo</Selo>}</td>}
                  <td data-rotulo="" className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" className="btn btn-texto btn-sm" onClick={() => abrir(r)} aria-label={`Editar ${String(r[colunas[0].campo] ?? '')}`}>Editar</button>
                      {temAtivo && (
                        <button type="button" className="btn btn-texto btn-sm" disabled={pendente}
                          onClick={() => acao(() => alternarAtivo(tabela, r.id, r.ativo === false))}>
                          {r.ativo === false ? 'Reativar' : 'Desativar'}
                        </button>
                      )}
                      {podeExcluir && (
                        <button type="button" className="btn btn-texto btn-sm" disabled={pendente}
                          onClick={() => { if (confirm('Excluir este registro?')) acao(() => excluirCadastro(tabela, r.id)); }}>
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal aberto={editando !== null} onFechar={() => setEditando(null)} titulo={editando === 'novo' ? rotuloNovo : `Editar ${titulo.toLowerCase()}`}>
        <form onSubmit={salvar} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            {campos.map((c) => {
              const id = `${tabela}-${c.nome}`;
              const err = errosCampo[c.nome];
              const comum = { id, name: c.nome, 'aria-invalid': err ? true : undefined, 'aria-describedby': err ? `${id}-erro` : c.ajuda ? `${id}-ajuda` : undefined };
              const set = (v: unknown) => setValores((s) => ({ ...s, [c.nome]: v }));
              if (c.tipo === 'booleano') {
                return (
                  <label key={c.nome} className="col-span-2 flex min-h-toque items-center gap-3 text-sm font-medium">
                    <input type="checkbox" className="check" {...comum} checked={Boolean(valores[c.nome])} onChange={(e) => set(e.target.checked)} />
                    {c.rotulo}
                  </label>
                );
              }
              return (
                <div key={c.nome} className={c.meia ? 'col-span-2 sm:col-span-1' : 'col-span-2'}>
                  <label htmlFor={id} className="rotulo">{c.rotulo}{!c.obrigatorio && <span className="font-normal text-text-secondary"> (opcional)</span>}</label>
                  {c.tipo === 'select' || c.tipo === 'uf' ? (
                    <select className="campo" {...comum} value={String(valores[c.nome] ?? '')} onChange={(e) => set(e.target.value)}>
                      <option value="">Selecione</option>
                      {(c.tipo === 'uf' ? UFS.map((u) => ({ valor: u, rotulo: u })) : c.opcoes ?? []).map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                    </select>
                  ) : (
                    <div className="relative">
                      {c.tipo === 'moeda' && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">R$</span>}
                      <input
                        className={`campo ${c.tipo === 'moeda' ? 'pl-11' : ''}`} {...comum}
                        type={c.tipo === 'numero' ? 'number' : c.tipo === 'data' ? 'date' : 'text'}
                        inputMode={c.tipo === 'moeda' ? 'decimal' : undefined}
                        placeholder={c.placeholder ?? (c.tipo === 'moeda' ? '0,00' : undefined)}
                        value={String(valores[c.nome] ?? '')} onChange={(e) => set(e.target.value)}
                      />
                    </div>
                  )}
                  {err ? <p id={`${id}-erro`} className="erro-campo">{err}</p> : c.ajuda && <p id={`${id}-ajuda`} className="ajuda">{c.ajuda}</p>}
                </div>
              );
            })}
          </div>
          {erro && <Aviso tipo="erro" titulo="Confira os dados">{erro}</Aviso>}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secundario" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primario" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
