import { formatarPlaca } from '@/lib/regras/placa';

/** Placa no estilo Mercosul (faixa azul "BRASIL"). Formato antigo é exibido com hífen. */
export function Placa({ placa, tamanho = 'md' }: { placa: string; tamanho?: 'sm' | 'md' | 'lg' }) {
  const t = {
    sm: { w: 'w-[104px]', faixa: 'h-[9px] text-[6px]', txt: 'text-[17px] py-0.5', borda: 'border-[1.5px] rounded-[5px]' },
    md: { w: 'w-[168px]', faixa: 'h-[14px] text-[9px]', txt: 'text-[28px] py-1', borda: 'border-2 rounded-[8px]' },
    lg: { w: 'w-[240px]', faixa: 'h-[20px] text-[12px]', txt: 'text-[40px] py-1.5', borda: 'border-[3px] rounded-[10px]' },
  }[tamanho];
  return (
    <span className={`inline-flex ${t.w} shrink-0 flex-col overflow-hidden border-[#151415] bg-[#fff] ${t.borda}`} role="img" aria-label={`Placa ${formatarPlaca(placa)}`}>
      <span className={`flex items-center justify-center bg-[#1B3F8B] font-body font-bold tracking-[0.3em] text-white ${t.faixa}`} aria-hidden>BRASIL</span>
      <span className={`text-center font-display font-black leading-none tracking-[0.08em] text-[#151415] ${t.txt}`} aria-hidden>{formatarPlaca(placa)}</span>
    </span>
  );
}
