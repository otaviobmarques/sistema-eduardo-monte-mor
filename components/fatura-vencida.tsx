'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';
import { data as fmtData, moeda } from '@/lib/formato';

export interface FaturaVencidaVista { id: string; descricao: string; valor: number; vencimento: string; link: string | null }

/**
 * Aviso em janela quando a Loja tem fatura vencida: aparece ao entrar no sistema (e quando uma fatura vence com ele aberto).
 * “Lembrar depois” esconde até a próxima sessão do navegador; o aviso em faixa continua no topo de todas as telas.
 */
export function AvisoFaturaVencida({ faturas, suspensao }: { faturas: FaturaVencidaVista[]; suspensao: string | null }) {
  const path = usePathname();
  const chave = `av-fatura-vencida:${faturas.map((f) => f.id).sort().join(',')}`;
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!faturas.length || path.startsWith('/loja/assinatura')) { setAberto(false); return; }
    let dispensado = false;
    try { dispensado = sessionStorage.getItem(chave) === '1'; } catch { /* sem armazenamento: mostra */ }
    setAberto(!dispensado);
  }, [chave, faturas.length, path]);
  if (!faturas.length) return null;
  const total = faturas.reduce((s, f) => s + Math.round(Number(f.valor) * 100), 0) / 100;
  const primeira = faturas[0];
  const lembrar = () => { try { sessionStorage.setItem(chave, '1'); } catch { /* */ } setAberto(false); };
  return (
    <Modal aberto={aberto} onFechar={lembrar} titulo={faturas.length === 1 ? 'Fatura vencida' : `${faturas.length} faturas vencidas`}
      descricao="A assinatura do Sistema de OS – Auto Visão está em atraso.">
      <div className="space-y-5" role="alert">
        <div className="flex gap-3 rounded-card border-l-4 border-error bg-error-bg p-4">
          <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-error text-sm font-bold text-white">!</span>
          <div className="space-y-1 text-sm">
            <p className="font-display text-2xl font-black text-impact">{moeda(total)}</p>
            {faturas.length === 1
              ? <p>{primeira.descricao} · venceu em {fmtData(primeira.vencimento)}</p>
              : <ul className="list-disc pl-5">{faturas.map((f) => <li key={f.id}>{f.descricao} · {moeda(f.valor)} · venceu em {fmtData(f.vencimento)}</li>)}</ul>}
            {suspensao && <p className="font-semibold text-error">Sem pagamento, o acesso da Loja e dos seus clientes será suspenso em {fmtData(suspensao)}.</p>}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secundario" onClick={lembrar}>Lembrar depois</button>
          {faturas.length === 1 && primeira.link
            ? <a href={primeira.link} target="_blank" rel="noreferrer" className="btn btn-primario" onClick={lembrar}>Pagar agora</a>
            : <Link href="/loja/assinatura" className="btn btn-primario" onClick={lembrar}>Ver faturas e pagar</Link>}
        </div>
        <p className="text-xs text-text-secondary">Já pagou? A baixa é automática em alguns minutos depois que o pagamento cai. Dúvidas, fale com o administrador do sistema.</p>
      </div>
    </Modal>
  );
}
