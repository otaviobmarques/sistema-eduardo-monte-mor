import type { Metadata } from 'next';
import { CarroLupa, CurvasConcentricas, FaixaQuadriculada, Logo } from '@/components/marca';
import { LoginForm } from './form';
import { CONTATO_GESTOR } from '@/lib/contato';

export const metadata: Metadata = { title: 'Entrar' };

const ERROS: Record<string, string> = { bloqueado: `Acesso bloqueado. Fale com ${CONTATO_GESTOR.nome}: ${CONTATO_GESTOR.telefone}.` };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-red p-10 text-white md:flex">
        <CurvasConcentricas />
        <Logo variante="sobre-vermelho" className="relative" />
        <div className="relative">
          <p className="kicker text-white/90">Vistorias veiculares</p>
          <h1 className="mt-3 font-display text-5xl font-black leading-[1.05]">Sistema de OS<br />Auto Visão</h1>
          <p className="mt-4 max-w-sm text-white/90">Nenhuma informação perdida, nenhum prazo despercebido e tudo rastreável por placa.</p>
          <CarroLupa className="mt-8 h-32 w-auto" />
        </div>
        <FaixaQuadriculada className="absolute bottom-0 left-0 right-0" />
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Logo className="mb-8 md:hidden" />
          <h2 className="font-display text-2xl font-black">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-text-secondary">Use o usuário e a senha fornecidos pela Auto Visão.</p>
          <LoginForm erroInicial={erro ? ERROS[erro] : undefined} />
          <div className="mt-8 rounded-card border border-divider bg-white p-4 text-sm">
            <p className="font-semibold text-text">Precisa de acesso, esqueceu a senha ou está bloqueado?</p>
            <p className="mt-1 text-text-secondary">Os acessos são criados e desbloqueados somente pelo gestor.</p>
            <a href={`tel:${CONTATO_GESTOR.tel}`} className="mt-3 inline-flex min-h-toque items-center gap-2 font-semibold text-action hover:underline">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
              {CONTATO_GESTOR.nome} · {CONTATO_GESTOR.telefone}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
