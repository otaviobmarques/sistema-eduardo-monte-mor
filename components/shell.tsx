'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo, Mosaico } from './marca';
import { Icone, type IconeNome } from './icone';
import { ContadorMenu } from './notificacoes';
import { Creditos } from './creditos';
import { ManterSessao } from './manter-sessao';

export interface ItemMenu { href: string; label: string; icone: IconeNome; badge?: number; contador?: 'alertas' | 'todas' }
export interface GrupoMenu { titulo: string; itens: ItemMenu[] }

function ativo(path: string, href: string, raiz: string) {
  return href === raiz ? path === raiz || path.startsWith(`${raiz}/os`) : path.startsWith(href);
}

export function Shell({
  grupos, raiz, usuario, subtitulo, barraInferior, sairAction, children, topo, liberados,
}: {
  grupos: GrupoMenu[]; raiz: string; usuario: string; subtitulo: string; barraInferior: ItemMenu[];
  sairAction: () => Promise<void>; children: React.ReactNode; topo?: React.ReactNode;
  /** Modo restrito (ex.: Loja bloqueada): só estes endereços ficam clicáveis; os demais itens aparecem inativos. */
  liberados?: string[];
}) {
  const inativo = (href: string) => !!liberados && !liberados.includes(href);
  const path = usePathname();
  const [aberto, setAberto] = useState(false);

  const menu = (
    <nav className="flex h-full flex-col" style={{ background: 'radial-gradient(120% 90% at 20% 0%, #2C2A2B, #151415)' }}>
      <div className="px-5 pb-4 pt-6"><Logo variante="branco" altura={40} /></div>
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {grupos.map((g) => (
          <div key={g.titulo} className="mt-4">
            <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/45">{g.titulo}</p>
            {g.itens.map((i) => {
              const a = ativo(path, i.href, raiz);
              if (inativo(i.href)) return (
                <span key={i.href} aria-disabled="true" title="Indisponível até a fatura ser paga"
                  className="flex min-h-toque cursor-not-allowed items-center gap-3 rounded-campo px-3 text-sm font-medium text-white/30">
                  <Icone nome={i.icone} className="h-5 w-5" /><span className="flex-1">{i.label}</span>
                  <span className="sr-only">(indisponível até a fatura ser paga)</span>
                </span>
              );
              return (
                <Link key={i.href} href={i.href} onClick={() => setAberto(false)} aria-current={a ? 'page' : undefined}
                  className={`flex min-h-toque items-center gap-3 rounded-campo px-3 text-sm font-medium transition-colors ${a ? 'bg-action text-white shadow-[0_6px_16px_rgba(201,35,44,.45)]' : 'text-white/80 hover:bg-white/10 hover:text-white'}`}>
                  <Icone nome={i.icone} className="h-5 w-5" />
                  <span className="flex-1">{i.label}</span>
                  {!!i.badge && <span className="rounded-full bg-brand-red px-2 py-0.5 text-xs font-bold text-white">{i.badge}</span>}
                  {i.contador && <ContadorMenu tipo={i.contador} />}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-5 py-4 text-white">
        <p className="truncate text-sm font-semibold">{usuario}</p>
        <p className="truncate text-xs text-white/60">{subtitulo}</p>
        <div className="mt-3 flex items-center gap-3">
          <Link href="/trocar-senha" className="text-xs text-white/70 underline-offset-2 hover:underline">Trocar senha</Link>
          <form action={sairAction}><button className="text-xs text-white/70 underline-offset-2 hover:underline">Sair</button></form>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 py-3"><Creditos tema="escuro" compacto /></div>
      <Mosaico modulo={10} />
    </nav>
  );

  return (
    <div className="min-h-screen min-[900px]:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 min-[900px]:block">{menu}</aside>
      {aberto && (
        <div className="fixed inset-0 z-40 min-[900px]:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-black/50" aria-label="Fechar menu" onClick={() => setAberto(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{menu}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-divider bg-white/95 px-4 backdrop-blur min-[900px]:hidden">
        <button className="btn btn-fantasma btn-sm -ml-2 px-2" onClick={() => setAberto(true)} aria-label="Abrir menu"><Icone nome="menu" className="h-6 w-6" /></button>
        <Logo altura={28} />
        <div className="ml-auto">{topo}</div>
      </header>
      <div className="hidden justify-end px-8 pt-4 min-[900px]:flex">{topo}</div>
      <main className="mx-auto max-w-[1200px] min-[1200px]:px-8 px-4 pb-24 pt-4 min-[900px]:px-8 min-[900px]:pb-10"><ManterSessao />{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-divider bg-white min-[900px]:hidden" aria-label="Atalhos">
        {barraInferior.map((i) => {
          const a = ativo(path, i.href, raiz);
          if (inativo(i.href)) return (
            <span key={i.href} aria-disabled="true" className="flex min-h-[56px] flex-1 cursor-not-allowed flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-text-secondary/40">
              <Icone nome={i.icone} className="h-5 w-5" />{i.label}<span className="sr-only">(indisponível)</span>
            </span>
          );
          return (
            <Link key={i.href} href={i.href} className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${a ? 'text-action' : 'text-text-secondary'}`}>
              <Icone nome={i.icone} className="h-5 w-5" />
              {i.label}
              {!!i.badge && <span className="absolute right-1/4 top-1.5 rounded-full bg-brand-red px-1.5 text-[10px] font-bold text-white">{i.badge}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
