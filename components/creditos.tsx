/* eslint-disable @next/next/no-img-element */
/**
 * Créditos do produto: sistema da Domma Tecnologia, site desenvolvido pela Agência RedBox.
 * Discretos, para não competir com a marca Auto Visão. `tema` segue o fundo: claro (login) ou escuro (menu lateral).
 */
export function Creditos({ tema = 'claro', compacto = false }: { tema?: 'claro' | 'escuro'; compacto?: boolean }) {
  const escuro = tema === 'escuro';
  const rotulo = escuro ? 'text-white/50' : 'text-text-secondary';
  const domma = escuro ? '/parceiros/domma-branco.png' : '/parceiros/domma.png';
  const redbox = escuro ? '/parceiros/redbox-branco.png' : '/parceiros/redbox.png';
  if (compacto) {
    return (
      <div className="space-y-2" aria-label="Créditos">
        <p className={`flex items-center gap-2 text-[11px] ${rotulo}`}>Um sistema<img src={domma} alt="Domma Tecnologia" className="h-5 w-auto" width={99} height={20} /></p>
        <p className={`flex items-center gap-2 text-[11px] ${rotulo}`}>Site desenvolvido por<img src={redbox} alt="Agência RedBox" className="h-3.5 w-auto" width={49} height={14} /></p>
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center gap-3 text-xs ${rotulo}`} aria-label="Créditos">
      <span className="flex items-center gap-2">Um sistema<img src={domma} alt="Domma Tecnologia" className="h-7 w-auto" width={139} height={28} /></span>
      <span className="flex items-center gap-2">Site desenvolvido por<img src={redbox} alt="Agência RedBox" className="h-[18px] w-auto" width={63} height={18} /></span>
    </div>
  );
}
