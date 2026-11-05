import { Mosaico, RecorteSimbolo } from './marca';

export function Hero({ kicker, titulo, descricao, children }: { kicker: string; titulo: React.ReactNode; descricao?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-hero bg-brand-red text-white">
      <RecorteSimbolo className="absolute -right-16 -top-24 h-[150%] w-auto md:-right-10" opacidade={0.12} />
      <div className="relative p-6 md:p-8">
        <p className="kicker text-white">{kicker}</p>
        <h1 className="mt-2 font-display text-[32px] font-black leading-[38px] md:text-[40px] md:leading-[44px]">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-2xl text-white/90">{descricao}</p>}
        {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
      </div>
      <Mosaico modulo={12} className="relative" />
    </section>
  );
}
