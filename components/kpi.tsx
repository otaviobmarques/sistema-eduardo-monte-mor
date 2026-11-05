export function Kpi({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; tom?: 'escuro' | 'alerta' }) {
  const cls = tom === 'escuro' ? 'bg-impact text-white border-impact' : tom === 'alerta' ? 'bg-white border-2 border-error' : 'bg-white border-divider';
  return (
    <div className={`rounded-card border p-4 ${cls}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tom === 'escuro' ? 'text-white/70' : 'text-text-secondary'}`}>{rotulo}</p>
      <p className="mt-1 font-display text-[26px] font-black leading-none sm:text-[32px]">{valor}</p>
      {detalhe && <p className={`mt-1 text-xs ${tom === 'escuro' ? 'text-white/70' : tom === 'alerta' ? 'text-error' : 'text-text-secondary'}`}>{detalhe}</p>}
    </div>
  );
}
export function GradeKpi({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}
