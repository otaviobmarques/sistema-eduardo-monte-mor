import Link from 'next/link';
import { Hero } from '@/components/hero';

export default function FilaPage() {
  return (
    <div className="space-y-6">
      <Hero kicker="Fila de OS" titulo="Ordens de serviço">
        <Link href="/loja/clientes" className="btn bg-white text-impact hover:bg-surface">Abrir OS para cliente</Link>
        <Link href="/loja/clientes" className="btn border-[1.5px] border-white text-white hover:bg-white/10">Importar lote</Link>
      </Hero>
      <p className="text-text-secondary">A fila completa entra na etapa 3.</p>
    </div>
  );
}
