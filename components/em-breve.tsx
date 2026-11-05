import Link from 'next/link';
import { Cabecalho } from './ui';

export function EmBreve({ titulo, etapa, descricao, voltar }: { titulo: string; etapa: number; descricao: string; voltar: string }) {
  return (
    <>
      <Cabecalho titulo={titulo} />
      <div className="card max-w-2xl p-8">
        <p className="rotulo-card">Em construção · etapa {etapa}</p>
        <p className="mt-2 text-text-secondary">{descricao}</p>
        <Link href={voltar} className="btn btn-secundario mt-6">Voltar</Link>
      </div>
    </>
  );
}
