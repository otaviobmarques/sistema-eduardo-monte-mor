import { CarroLupa, CurvasConcentricas, FaixaQuadriculada } from './marca';

export function Hero({ kicker, titulo, children }: { kicker: string; titulo: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-hero bg-brand-red text-white">
      <CurvasConcentricas />
      <div className="relative flex flex-col gap-4 p-6 md:flex-row md:items-end md:justify-between md:p-8">
        <div>
          <p className="kicker text-white/90">{kicker}</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight md:text-4xl">{titulo}</h1>
          {children && <div className="mt-5 flex flex-wrap gap-3">{children}</div>}
        </div>
        <CarroLupa className="hidden h-28 w-auto shrink-0 md:block" />
      </div>
      <FaixaQuadriculada />
    </section>
  );
}
