'use client';
import { useState, useTransition } from 'react';
import { salvarPrecos } from '@/app/loja/cadastros/actions';
import { moeda, parseMoeda, valorParaCampo } from '@/lib/formato';
import { Aviso } from './ui';

type Item = { id: string; nome: string };

/** Tabela serviço × categoria. Com empresaId, campos vazios usam o preço padrão. */
export function PrecosMatriz({
  servicos, categorias, valores, padrao, empresaId = null,
}: {
  servicos: Item[]; categorias: Item[]; valores: Record<string, number>; padrao?: Record<string, number>; empresaId?: string | null;
}) {
  const chave = (s: string, c: string) => `${s}:${c}`;
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries(servicos.flatMap((s) => categorias.map((c) => [chave(s.id, c.id), valorParaCampo(valores[chave(s.id, c.id)])]))));
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [alterado, setAlterado] = useState(false);

  function salvar() {
    const itens = servicos.flatMap((s) => categorias.map((c) => {
      const raw = v[chave(s.id, c.id)];
      return { servico_id: s.id, categoria_id: c.id, valor: raw?.trim() ? parseMoeda(raw) : null };
    }));
    if (itens.some((i, idx) => i.valor === null && v[chave(servicos[Math.floor(idx / categorias.length)].id, categorias[idx % categorias.length].id)]?.trim())) {
      setMsg({ tipo: 'erro', texto: 'Há valores inválidos. Use o formato 150,00.' });
      return;
    }
    iniciar(async () => {
      const r = await salvarPrecos(empresaId, itens);
      setMsg(r.ok ? { tipo: 'ok', texto: 'Preços salvos.' } : { tipo: 'erro', texto: r.erro });
      if (r.ok) setAlterado(false);
    });
  }

  if (!servicos.length) return <p className="text-text-secondary">Cadastre um serviço ativo para definir preços.</p>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="tabela min-w-[560px]">
          <thead>
            <tr><th scope="col">Serviço</th>{categorias.map((c) => <th key={c.id} scope="col">{c.nome}</th>)}</tr>
          </thead>
          <tbody>
            {servicos.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="px-3 py-2 text-left font-semibold">{s.nome}</th>
                {categorias.map((c) => {
                  const k = chave(s.id, c.id);
                  return (
                    <td key={c.id} className="min-w-[120px]">
                      <label className="sr-only" htmlFor={`p-${k}`}>{`${s.nome} · ${c.nome}`}</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary">R$</span>
                        <input id={`p-${k}`} inputMode="decimal" className="campo h-10 pl-9 text-sm" value={v[k] ?? ''}
                          placeholder={padrao ? valorParaCampo(padrao[k] ?? 0) : '0,00'}
                          onChange={(e) => { setV((x) => ({ ...x, [k]: e.target.value })); setAlterado(true); setMsg(null); }} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {padrao && <p className="ajuda">Campo vazio usa o preço padrão (mostrado em cinza). Ex.: Carro padrão {moeda(padrao[chave(servicos[0].id, categorias[0].id)] ?? 0)}.</p>}
      {msg && <Aviso tipo={msg.tipo} titulo={msg.tipo === 'ok' ? 'Tudo certo' : 'Confira os valores'}>{msg.texto}</Aviso>}
      <div className="flex justify-end">
        <button type="button" className="btn btn-primario" onClick={salvar} disabled={pendente || !alterado}>{pendente ? 'Salvando…' : 'Salvar preços'}</button>
      </div>
    </div>
  );
}
