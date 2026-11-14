import Link from 'next/link';
import { hora } from '@/lib/formato';
import type { chegadasDeHoje } from '@/lib/paineis';

type Chegadas = Awaited<ReturnType<typeof chegadasDeHoje>>;

/** Painel da Loja: aviso das OS (pedidos de laudo) que chegaram hoje. Atualiza sozinho com o Realtime da página. */
export function ChegadasHoje({ c }: { c: Chegadas }) {
  if (!c.total) {
    return (
      <section className="card flex items-center gap-3 border-l-4 border-l-divider px-5 py-4" aria-label="Chegaram hoje" data-teste="chegadas-hoje">
        <p className="text-text-secondary"><strong className="text-text">Chegaram hoje:</strong> nenhuma OS nova até agora.</p>
      </section>
    );
  }
  return (
    <section className="card border-l-4 border-l-action p-5" aria-labelledby="chegadas-titulo" data-teste="chegadas-hoje">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-4">
          <span className="font-display text-[44px] font-black leading-none text-action" aria-hidden>{c.total}</span>
          <div>
            <h2 id="chegadas-titulo" className="font-display text-xl font-extrabold text-text">
              {c.total === 1 ? 'Chegou 1 OS nova hoje' : `Chegaram ${c.total} OS novas hoje`}
            </h2>
            <p className="text-sm text-text-secondary">
              {c.ultima && <>Última às {hora(c.ultima)}</>}
              {c.lotes > 0 && <> · {c.lotes === 1 ? '1 lote' : `${c.lotes} lotes`} importado{c.lotes === 1 ? '' : 's'}</>}
            </p>
          </div>
        </div>
        <Link href={`/loja/pendencias?dia=${c.hoje}`} className="btn btn-secundario btn-sm self-start">Ver as de hoje</Link>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Por cliente">
        {c.porCliente.map(([cli, n]) => (
          <li key={cli} className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-text">{cli} <span className="text-action">{n}</span></li>
        ))}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Mais recentes">
        {c.recentes.map((o) => (
          <li key={o.numero}>
            <Link href={`/loja/os/${o.numero}`} className="font-semibold text-text underline-offset-2 hover:underline">{o.placa}</Link>
            <span className="text-text-secondary">{o.modelo ? ` · ${o.modelo}` : ''} · {hora(o.em)}</span>
          </li>
        ))}
        {c.total > c.recentes.length && <li className="text-text-secondary">e mais {c.total - c.recentes.length}</li>}
      </ul>
    </section>
  );
}
