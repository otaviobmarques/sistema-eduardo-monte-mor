import Link from 'next/link';
import { Hero } from '@/components/hero';

export default function FilaPage() {
  return (
    <div className="space-y-6">
      <Hero kicker="Fila de OS" titulo="Ordens de serviço">
        <Link href="/loja/clientes" className="btn btn-claro">Abrir OS para cliente</Link>
        <Link href="/loja/clientes" className="btn btn-contorno-claro">Importar lote</Link>
      </Hero>
      <p className="text-text-secondary">A fila completa entra na etapa 3.</p>
    </div>
  );
}
