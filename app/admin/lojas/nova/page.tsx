import type { Metadata } from 'next';
import Link from 'next/link';
import { Cabecalho } from '@/components/ui';
import { LojaForm } from '../../loja-form';

export const metadata: Metadata = { title: 'Nova Loja' };

export default function NovaLoja() {
  return (
    <>
      <Link href="/admin" className="btn btn-texto btn-sm -ml-3 mb-2">← Lojas</Link>
      <Cabecalho titulo="Nova Loja" descricao="A Loja já nasce com serviço, motivos e configurações padrão. Depois gere o acesso do Gestor." />
      <LojaForm />
    </>
  );
}
