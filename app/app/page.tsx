import Link from 'next/link';
import { Hero } from '@/components/hero';
import { exigirPerfil } from '@/lib/sessao';

export default async function PainelCliente() {
  const s = await exigirPerfil('cliente');
  const nome = s.empresa?.nome_fantasia || s.empresa?.razao_social;
  return (
    <div className="space-y-6">
      <Hero kicker="Painel" titulo={`Olá, ${nome}`}>
        <Link href="/app/nova-os" className="btn bg-white text-impact hover:bg-surface">Nova OS</Link>
        <Link href="/app/importar" className="btn border-[1.5px] border-white text-white hover:bg-white/10">Importar planilha</Link>
      </Hero>
      <p className="text-text-secondary">O painel completo entra na etapa 3.</p>
    </div>
  );
}
