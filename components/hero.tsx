import { Mosaico, RecorteSimbolo } from './marca';

export function Hero({ kicker, titulo, descricao, children, marca }: { kicker: string; titulo: React.ReactNode; descricao?: React.ReactNode; children?: React.ReactNode; marca?: { src: string; nome: string } | null }) {
  return (
    <section className="relative overflow-hidden rounded-hero bg-brand-red text-white">
      <RecorteSimbolo className="absolute -right-16 -top-24 h-[150%] w-auto md:-right-10" opacidade={0.12} />
      <div className={`relative p-6 md:p-8 ${marca ? 'md:pr-[320px]' : ''}`}>
        {marca && (
          <div className="mb-4 inline-flex h-16 max-w-[220px] items-center rounded-card bg-[#fff] px-4 py-2 shadow-lg md:absolute md:right-8 md:top-8 md:mb-0 md:h-20 md:max-w-[260px]" data-teste="logo-cliente-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={marca.src} alt={`Logotipo de ${marca.nome}`} className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <p className="kicker text-white">{kicker}</p>
        <h1 className="mt-2 font-display text-[32px] font-black leading-[38px] md:text-[40px] md:leading-[44px]">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-2xl text-white/90">{descricao}</p>}
        {children && <div className="mt-6 flex flex-wrap gap-3">{children}</div>}
      </div>
      <Mosaico modulo={12} className="relative" />
    </section>
  );
}
