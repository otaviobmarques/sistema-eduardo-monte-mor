import type { Metadata } from 'next';
import { CarroLupa, CurvasConcentricas, FaixaQuadriculada, Logo } from '@/components/marca';
import { LoginForm } from './form';

export const metadata: Metadata = { title: 'Entrar' };

const ERROS: Record<string, string> = { bloqueado: 'Acesso bloqueado. Fale com a Auto Visão.' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="grid min-h-screen md:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-red p-10 text-white md:flex">
        <CurvasConcentricas />
        <Logo variante="branco" className="relative" />
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
        </div>
      </section>
    </main>
  );
}
