import type { Metadata } from 'next';
import { Logo } from '@/components/marca';
import { Recuperar } from './recuperar';

export const metadata: Metadata = { title: 'Reconectando' };

/** Renova a sessão pelo navegador quando o servidor não a reconheceu, e volta para a página em que a pessoa estava. */
export default async function SessaoPage({ searchParams }: { searchParams: Promise<{ volta?: string }> }) {
  const { volta } = await searchParams;
  const destino = volta && volta.startsWith('/') && !volta.startsWith('//') && !volta.startsWith('/sessao') ? volta : '/';
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="card w-full max-w-sm p-8 text-center" role="status" aria-live="polite">
        <Logo className="mx-auto mb-6" altura={36} prioridade />
        <p className="font-display text-xl font-extrabold">Reconectando…</p>
        <p className="mt-2 text-sm text-text-secondary">Renovando o seu acesso. Você volta para a página em instantes.</p>
        <Recuperar destino={destino} />
      </div>
    </main>
  );
}
