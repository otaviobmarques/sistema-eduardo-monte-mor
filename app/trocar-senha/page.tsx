import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo, FaixaQuadriculada } from '@/components/marca';
import { getSessao } from '@/lib/sessao';
import { TrocaForm } from './form';
import { sair } from '../login/actions';

export const metadata: Metadata = { title: 'Trocar senha' };

export default async function TrocarSenhaPage() {
  const s = await getSessao();
  if (!s) redirect('/login');
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md overflow-hidden">
        <div className="p-6">
          <Logo className="mb-6" />
          <h1 className="font-display text-2xl font-black">Crie sua senha</h1>
          <p className="mb-6 mt-1 text-sm text-text-secondary">
            Olá, {s.perfil.nome_exibicao}. {s.perfil.deve_trocar_senha ? 'No primeiro acesso é obrigatório trocar a senha temporária.' : 'Defina uma nova senha.'}
          </p>
          <TrocaForm />
          <form action={sair} className="mt-3"><button className="btn btn-fantasma btn-sm w-full">Sair</button></form>
        </div>
        <FaixaQuadriculada />
      </div>
    </main>
  );
}
