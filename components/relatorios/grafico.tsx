/** Gráfico de barras de uma série (sem legenda: o título nomeia a série). Hover/foco mostra o valor; a tabela ao lado é a visão acessível. */
export function GraficoBarras({ itens, titulo, formato, vertical }: {
  itens: { rotulo: string; valor: number; detalhe?: string }[]; titulo: string; formato: (v: number) => string; vertical?: boolean;
}) {
  const max = Math.max(...itens.map((i) => i.valor), 0);
  if (!itens.length || max <= 0) return <p className="py-10 text-center text-text-secondary">Sem dados no período para o gráfico.</p>;
  const w = (v: number) => `${Math.max((v / max) * 100, v > 0 ? 1.5 : 0)}%`;

  if (vertical) {
    return (
      <figure aria-label={titulo}>
        <div className="flex h-56 items-end gap-[2px] border-b border-divider" role="list">
          {itens.map((i) => (
            <div key={i.rotulo} role="listitem" tabIndex={0} aria-label={`${i.rotulo}: ${formato(i.valor)}${i.detalhe ? ` · ${i.detalhe}` : ''}`}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none focus-visible:bg-surface hover:bg-surface">
              <div className="w-full max-w-[48px] rounded-t-[4px] bg-brand-graphite transition-colors duration-[120ms] group-hover:bg-impact group-focus-visible:bg-impact" style={{ height: w(i.valor) }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-campo bg-impact px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-visible:block">
                <span className="font-semibold">{i.rotulo}</span> · {formato(i.valor)}{i.detalhe ? <span className="block text-white/70">{i.detalhe}</span> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-[2px]" aria-hidden>
          {itens.map((i, n) => <span key={i.rotulo} className="min-w-0 flex-1 truncate text-center text-xs text-text-secondary">{itens.length > 12 && n % 2 ? '' : i.rotulo}</span>)}
        </div>
      </figure>
    );
  }
  return (
    <figure aria-label={titulo}>
      <ul className="space-y-[2px]">
        {itens.slice(0, 15).map((i) => (
          <li key={i.rotulo} tabIndex={0} aria-label={`${i.rotulo}: ${formato(i.valor)}${i.detalhe ? ` · ${i.detalhe}` : ''}`}
            className="group relative grid grid-cols-[minmax(96px,32%)_1fr_auto] items-center gap-3 rounded-campo px-2 py-1.5 outline-none hover:bg-surface focus-visible:bg-surface">
            <span className="truncate text-sm" title={i.rotulo}>{i.rotulo}</span>
            <span className="h-5"><span className="block h-full rounded-r-[4px] bg-brand-graphite transition-colors duration-[120ms] group-hover:bg-impact group-focus-visible:bg-impact" style={{ width: w(i.valor) }} /></span>
            <span className="text-right text-sm font-semibold tabular-nums text-text">{formato(i.valor)}</span>
            {i.detalhe && <span className="pointer-events-none absolute right-2 top-full z-10 hidden whitespace-nowrap rounded-campo bg-impact px-3 py-2 text-xs text-white shadow-lg group-hover:block group-focus-visible:block">{i.detalhe}</span>}
          </li>
        ))}
      </ul>
      {itens.length > 15 && <figcaption className="mt-2 text-xs text-text-secondary">Mostrando os 15 maiores de {itens.length}. A tabela abaixo tem todos.</figcaption>}
    </figure>
  );
}
