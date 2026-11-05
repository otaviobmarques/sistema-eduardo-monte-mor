const PASSOS = ['Modelo', 'Envio', 'Prévia', 'Criar'];

export function Passos({ atual }: { atual: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Etapas da importação">
      {PASSOS.map((p, i) => {
        const n = i + 1, feito = n < atual, ativo = n === atual;
        return (
          <li key={p} aria-current={ativo ? 'step' : undefined} className={`flex items-center gap-2 rounded-card border p-3 text-sm ${ativo ? 'border-impact bg-white font-semibold' : feito ? 'border-divider bg-white text-ok' : 'border-divider bg-surface text-text-secondary'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ativo ? 'bg-action text-white' : feito ? 'bg-ok text-white' : 'bg-divider text-text-secondary'}`} aria-hidden>{feito ? '✓' : n}</span>
            <span className="truncate">{p}</span>
          </li>
        );
      })}
    </ol>
  );
}
